import { Queue, Worker, Job } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IngestionService } from "@/lib/leads/ingestion";

const connection = createRedis({ maxRetriesPerRequest: null });

export const INGESTION_QUEUE_NAME = "lead-ingestion";
export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection,
  // A Graph fetch inside the worker can fail transiently (rate limits, blips); without retries a
  // single hiccup would lose the lead. Retry with exponential backoff before giving up.
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export interface IngestionJobData {
  webhookEventId: string;
}

export const ingestionWorker = new Worker<IngestionJobData>(
  INGESTION_QUEUE_NAME,
  async (job: Job<IngestionJobData>) => {
    const { webhookEventId } = job.data;

    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId)).limit(1);
    
    if (!event) throw new Error("Webhook event not found");
    if (event.status === 'processed') return { status: 'skipped', reason: 'already_processed' };

    try {
      // Mark as processing and increment retry count
      await db.update(webhookEvents)
        .set({ status: 'processing', retryCount: event.retryCount + 1 })
        .where(eq(webhookEvents.id, event.id));

      const rawPayload = (event.payload || {}) as any;
      let normalized: any;

      if (event.provider === "facebook" || (event.provider === "facebook_lead_ads" && !rawPayload.sourceId)) {
        const pageId = rawPayload.page_id || rawPayload.raw?.page_id;
        const leadgenId = rawPayload.leadgen_id;

        // Look up active Facebook Lead Ads source matching this Page
        const { leadSources } = await import("@/db/schema");
        const allFbSources = await db
          .select()
          .from(leadSources)
          .where(eq(leadSources.type, "facebook_lead_ads"));

        const pageMatches = allFbSources.filter((s) => (s.config as any)?.pageId === pageId);

        // Tenant safety: a Page must belong to exactly one org. If two orgs have connected the same
        // Page, routing is ambiguous — refuse rather than leak a lead into the wrong tenant.
        const matchedOrgs = new Set(pageMatches.map((s) => s.organizationId));
        if (matchedOrgs.size > 1) {
          throw new Error(`Page ID ${pageId} is connected by multiple organizations — refusing to route ambiguously`);
        }

        const matchedSource = pageMatches.find((s) => s.isActive === 1) || pageMatches[0];
        if (!matchedSource || !matchedSource.organizationId) {
          throw new Error(`No Facebook Lead Ads source configured for Page ID: ${pageId || "unknown"}`);
        }

        const sourceId = matchedSource.id;
        const organizationId = matchedSource.organizationId;
        const pageAccessToken = (matchedSource.config as any)?.pageAccessToken;
        const sourceConfig = (matchedSource.config as any) || {};
        const formId = rawPayload.form_id || rawPayload.raw?.form_id;

        // Form filter: the webhook payload carries form_id, so we can drop leads from unselected
        // forms BEFORE spending a Graph API call. Empty filter = capture every form on the Page.
        const rawFormFilter = sourceConfig.formFilter;
        const formFilter: string[] = Array.isArray(rawFormFilter) ? rawFormFilter.map((s) => String(s)) : [];

        if (formFilter.length > 0 && !formFilter.includes(String(formId))) {
          console.log(`[FACEBOOK_INGESTION_SKIPPED] Lead from form "${formId}" skipped by form filter.`);
          await db
            .update(webhookEvents)
            .set({ status: "processed", processedAt: new Date(), errorLog: { reason: "filtered_by_form_filter" } })
            .where(eq(webhookEvents.id, event.id));
          return { status: "skipped", reason: "filtered_form" };
        }

        let fbLeadData = rawPayload;
        // If the payload only has the leadgen_id (standard Meta webhook), fetch actual lead answers from Graph API
        if ((!rawPayload.field_data || rawPayload.field_data.length === 0) && leadgenId && pageAccessToken) {
          const { MetaTokenRefreshService } = await import("@/domains/leads/metaTokenRefreshService");
          try {
            fbLeadData = await MetaTokenRefreshService.fetchLeadgenData(leadgenId, pageAccessToken);
          } catch (e: any) {
            // Dead token: flag the source for reconnect and stop — retrying a revoked token is futile.
            if (MetaTokenRefreshService.isAuthError(e)) {
              const { LeadSourceService } = await import("@/domains/leads/sourceService");
              await LeadSourceService.markNeedsReconnect(matchedSource.id);
              await db
                .update(webhookEvents)
                .set({ status: "failed", errorLog: { reason: "auth_error_needs_reconnect", message: e.message } })
                .where(eq(webhookEvents.id, event.id));
              return { status: "failed", reason: "needs_reconnect" };
            }
            throw e; // transient → outer catch marks failed and BullMQ retries
          }
        }

        const { FacebookLeadMappingService } = await import("@/domains/leads/facebookLeadMappingService");
        const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(fbLeadData);

        // A lead with neither email nor phone can't be deduped/contacted — skip cleanly instead of
        // letting processLead throw (which would burn all retry attempts on an unfixable lead).
        if (!mapped.email && !mapped.phone) {
          await db
            .update(webhookEvents)
            .set({ status: "processed", processedAt: new Date(), errorLog: { reason: "no_contact_info" } })
            .where(eq(webhookEvents.id, event.id));
          return { status: "skipped", reason: "no_contact_info" };
        }

        normalized = {
          name: mapped.name,
          email: mapped.email || undefined,
          phone: mapped.phone || undefined,
          sourceId,
          organizationId,
          externalId: mapped.facebookLeadgenId || leadgenId,
          expectedValue: mapped.expectedValue,
          customData: {
            ...mapped.customData,
            leadSource: mapped.source,
          },
        };
      } else {
        let adapter: any;
        if (event.provider === "webform") {
          const { WebFormAdapter } = await import("@/lib/integrations/adapters/WebFormAdapter");
          adapter = new WebFormAdapter();
        } else if (event.provider === "facebook_lead_ads") {
          const { FacebookLeadAdsAdapter } = await import("@/lib/integrations/adapters/FacebookLeadAdsAdapter");
          adapter = new FacebookLeadAdsAdapter();
        } else if (event.provider === "generic_webhook") {
          const { GenericWebhookAdapter } = await import("@/lib/integrations/adapters/GenericWebhookAdapter");
          adapter = new GenericWebhookAdapter();
        } else {
          throw new Error(`Unsupported provider: ${event.provider}`);
        }

        const sourceId = rawPayload.sourceId;
        if (!sourceId) {
          throw new Error("Missing sourceId in payload");
        }

        normalized = await adapter.normalize(rawPayload, sourceId, rawPayload.teamId, rawPayload.ownerId);
        if (rawPayload.organizationId) {
          normalized.organizationId = rawPayload.organizationId;
        }
      }

      const result = await IngestionService.processLead(normalized);

      await db.update(webhookEvents)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(webhookEvents.id, event.id));

      return result;

    } catch (error: any) {
      await db.update(webhookEvents)
        .set({ 
          status: 'failed', 
          errorLog: { message: error.message, stack: error.stack } 
        })
        .where(eq(webhookEvents.id, event.id));
        
      throw error;
    }
  },
  { connection, concurrency: 5 }
);
quietErrors(ingestionWorker);
