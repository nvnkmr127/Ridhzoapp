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
type SourceRow = typeof leadSources.$inferSelect;
type Outcome = FbIngestResult & { mark: { status: string; errorLog?: Record<string, unknown> } };

export class FacebookIngestionService {
  static async processEvent(event: { id: string; payload: unknown }): Promise<FbIngestResult> {
    const rawPayload = (event.payload || {}) as any;
    const pageId = rawPayload.page_id || rawPayload.raw?.page_id;

    const allFbSources = await db.select().from(leadSources).where(eq(leadSources.type, "facebook_lead_ads"));
    const pageMatches = allFbSources.filter((s) => (s.config as any)?.pageId === pageId);
    if (pageMatches.length === 0) {
      // No source for this Page (it was deleted, or never connected): nothing will ever match, so
      // retrying only fills the failed queue. Record it as skipped and stop.
      await this.markEvent(event.id, "skipped", { reason: "no_source_for_page", message: `No Facebook Lead Ads source for Page ${pageId || "unknown"}` });
      return { status: "skipped", reason: "no_source_for_page" };
    }

    // A Page may be connected by several orgs: every org gets its own copy of the lead. One source
    // per org (prefer the active one). A transient error in any org throws so the whole event is
    // retried — safe, because ingestion dedups per org by contact.
    const perOrg = new Map<string, SourceRow>();
    for (const s of pageMatches) {
      if (!s.organizationId) continue;
      const cur = perOrg.get(s.organizationId);
      if (!cur || (cur.isActive !== 1 && s.isActive === 1)) perOrg.set(s.organizationId, s);
    }
    const outcomes: Outcome[] = [];
    for (const source of perOrg.values()) outcomes.push(await this.ingestForSource(event.id, rawPayload, pageId, source));

    // Any org with a dead token → keep the event failed so reconnecting that org replays it.
    const failed = outcomes.find((o) => o.mark.status === "failed");
    const mark = failed?.mark ?? (outcomes.length === 1 ? outcomes[0].mark : { status: "processed" });
    await this.markEvent(event.id, mark.status, mark.errorLog);
    const { mark: _m, ...result } = failed ?? outcomes.find((o) => o.leadId) ?? outcomes[0];
    return result;
  }

  private static async ingestForSource(eventId: string, rawPayload: any, pageId: string, matchedSource: SourceRow): Promise<Outcome> {
    const leadgenId = rawPayload.leadgen_id;
    const formId = rawPayload.form_id || rawPayload.raw?.form_id;

    // A source the user intentionally paused (inactive, and NOT flagged for reconnect) must stop
    // ingesting. A needs-reconnect source is also inactive but we keep processing it — the Graph
    // call fails auth and the event is recorded for replay after reconnect (don't drop those).
    const matchedConfig = (matchedSource.config as any) || {};
    if (matchedSource.isActive !== 1 && !matchedConfig.needsReconnect) {
      console.log(`[FB_INGEST] event=${eventId} source=${matchedSource.id} is inactive (paused) — skipping`);
      return { status: "skipped", reason: "source_inactive", mark: { status: "processed", errorLog: { reason: "source_inactive" } } };
    }

    const organizationId = matchedSource.organizationId!;
    const sourceId = matchedSource.id;
    const sourceConfig = matchedConfig;
    const { readSecret } = await import("@/lib/crypto/secret");
    const pageAccessToken = readSecret(sourceConfig.pageAccessToken);

    // Form filter (empty = all forms). form_id is in the webhook payload, so we can drop unselected
    // forms before spending a Graph call.
    const rawFormFilter = sourceConfig.formFilter;
    const formFilter: string[] = Array.isArray(rawFormFilter) ? rawFormFilter.map((s: unknown) => String(s)) : [];
    if (formFilter.length > 0 && !formFilter.includes(String(formId))) {
      console.log(`[FB_INGEST] event=${eventId} source=${sourceId} form=${formId} skipped by form filter`);
      return { status: "skipped", reason: "filtered_form", mark: { status: "processed", errorLog: { reason: "filtered_by_form_filter" } } };
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
          return { status: "failed", reason: "needs_reconnect", mark: { status: "failed", errorLog: { reason: "auth_error_needs_reconnect", message: e.message } } };
        }
        throw e; // transient → caller retries
      }
    }

    const { FacebookLeadMappingService } = await import("@/domains/leads/facebookLeadMappingService");
    // Apply the source's saved field mappings (form question → custom field / lead field), if any.
    const fieldMappings = Array.isArray(sourceConfig.fieldMappings) ? sourceConfig.fieldMappings : undefined;
    // The Page isn't a Lead field on Graph; carry it over from the webhook payload.
    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead({ ...fbLeadData, page_id: fbLeadData?.page_id ?? pageId }, fieldMappings);
    if (!mapped.email && !mapped.phone) {
      return { status: "skipped", reason: "no_contact_info", mark: { status: "processed", errorLog: { reason: "no_contact_info" } } };
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

    console.log(
      `[FB_INGEST] event=${eventId} org=${organizationId} lead=${result.leadId} status=${result.status} page=${pageId} form=${formId}`,
    );
    return { ...result, mark: { status: "processed" } };
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
