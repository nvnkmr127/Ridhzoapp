import { db } from "@/db";
import { webhookEvents, leadSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IngestionService } from "@/lib/leads/ingestion";

export interface FbIngestResult {
  status: string; // success | deduplicated | skipped | failed
  reason?: string;
  leadId?: string;
}

// Processes a stored "facebook" webhook event end to end: match the Page's source, apply the form
// filter, resolve the lead's answers from Graph, map + ingest. It owns the event's terminal status
// so both callers behave identically:
//   • the webhook route runs it INLINE (no dependency on the droplet worker), and
//   • the ingestion worker runs it for any queued/legacy jobs.
// Terminal outcomes (success/skip/auth) update the event and return; TRANSIENT errors throw so the
// caller can retry (Meta re-delivers the webhook on a 5xx; BullMQ retries a queued job).
export class FacebookIngestionService {
  static async processEvent(event: { id: string; payload: unknown }): Promise<FbIngestResult> {
    const rawPayload = (event.payload || {}) as any;
    const pageId = rawPayload.page_id || rawPayload.raw?.page_id;
    const leadgenId = rawPayload.leadgen_id;
    const formId = rawPayload.form_id || rawPayload.raw?.form_id;

    const allFbSources = await db.select().from(leadSources).where(eq(leadSources.type, "facebook_lead_ads"));
    const pageMatches = allFbSources.filter((s) => (s.config as any)?.pageId === pageId);

    // Tenant safety: a Page must belong to exactly one org, or routing is ambiguous. This is
    // TERMINAL (not thrown) so Meta doesn't retry it forever and block both tenants — the conflict
    // needs a human to delete one source, retrying can't resolve it.
    if (new Set(pageMatches.map((s) => s.organizationId)).size > 1) {
      const orgs = [...new Set(pageMatches.map((s) => s.organizationId))].join(", ");
      console.error(`[FB_INGEST] event=${event.id} page=${pageId} connected by multiple orgs (${orgs}) — refusing to route`);
      await this.markEvent(event.id, "failed", { reason: "page_multi_org_conflict", message: `Page ${pageId} connected by orgs: ${orgs}` });
      return { status: "failed", reason: "page_multi_org_conflict" };
    }
    const matchedSource = pageMatches.find((s) => s.isActive === 1) || pageMatches[0];
    if (!matchedSource || !matchedSource.organizationId) {
      throw new Error(`No Facebook Lead Ads source configured for Page ID: ${pageId || "unknown"}`);
    }

    // A source the user intentionally paused (inactive, and NOT flagged for reconnect) must stop
    // ingesting. A needs-reconnect source is also inactive but we keep processing it — the Graph
    // call fails auth and the event is recorded for replay after reconnect (don't drop those).
    const matchedConfig = (matchedSource.config as any) || {};
    if (matchedSource.isActive !== 1 && !matchedConfig.needsReconnect) {
      console.log(`[FB_INGEST] event=${event.id} source=${matchedSource.id} is inactive (paused) — skipping`);
      await this.markEvent(event.id, "processed", { reason: "source_inactive" });
      return { status: "skipped", reason: "source_inactive" };
    }

    const organizationId = matchedSource.organizationId;
    const sourceId = matchedSource.id;
    const sourceConfig = matchedConfig;
    const pageAccessToken = sourceConfig.pageAccessToken;

    // Form filter (empty = all forms). form_id is in the webhook payload, so we can drop unselected
    // forms before spending a Graph call.
    const rawFormFilter = sourceConfig.formFilter;
    const formFilter: string[] = Array.isArray(rawFormFilter) ? rawFormFilter.map((s: unknown) => String(s)) : [];
    if (formFilter.length > 0 && !formFilter.includes(String(formId))) {
      console.log(`[FB_INGEST] event=${event.id} form=${formId} skipped by form filter`);
      await this.markEvent(event.id, "processed", { reason: "filtered_by_form_filter" });
      return { status: "skipped", reason: "filtered_form" };
    }

    const { MetaTokenRefreshService } = await import("@/domains/leads/metaTokenRefreshService");
    let fbLeadData = rawPayload;
    if ((!rawPayload.field_data || rawPayload.field_data.length === 0) && leadgenId && pageAccessToken) {
      try {
        fbLeadData = await MetaTokenRefreshService.fetchLeadgenData(leadgenId, pageAccessToken);
      } catch (e: any) {
        // Dead token → flag the source for reconnect and stop (retrying a revoked token is futile).
        if (MetaTokenRefreshService.isAuthError(e)) {
          const { LeadSourceService } = await import("@/domains/leads/sourceService");
          await LeadSourceService.markNeedsReconnect(matchedSource.id);
          await this.markEvent(event.id, "failed", { reason: "auth_error_needs_reconnect", message: e.message });
          return { status: "failed", reason: "needs_reconnect" };
        }
        throw e; // transient → caller retries
      }
    }

    const { FacebookLeadMappingService } = await import("@/domains/leads/facebookLeadMappingService");
    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(fbLeadData);
    if (!mapped.email && !mapped.phone) {
      await this.markEvent(event.id, "processed", { reason: "no_contact_info" });
      return { status: "skipped", reason: "no_contact_info" };
    }

    const result = await IngestionService.processLead({
      name: mapped.name,
      email: mapped.email || undefined,
      phone: mapped.phone || undefined,
      sourceId,
      organizationId,
      externalId: mapped.facebookLeadgenId || leadgenId,
      expectedValue: mapped.expectedValue,
      customData: { ...mapped.customData, leadSource: mapped.source },
    });

    await this.markEvent(event.id, "processed");
    console.log(
      `[FB_INGEST] event=${event.id} lead=${result.leadId} status=${result.status} page=${pageId} form=${formId}`,
    );
    return result;
  }

  private static async markEvent(id: string, status: string, errorLog?: Record<string, unknown>) {
    await db
      .update(webhookEvents)
      .set({
        status,
        ...(status === "processed" ? { processedAt: new Date() } : {}),
        ...(errorLog ? { errorLog } : {}),
      })
      .where(eq(webhookEvents.id, id));
  }
}
