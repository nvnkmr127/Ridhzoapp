import { Worker, Job } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IngestionService } from "@/lib/leads/ingestion";

import { INGESTION_QUEUE_NAME, type IngestionJobData } from "../queues/ingestionQueue";

const connection = createRedis({ maxRetriesPerRequest: null });

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
        // Shared with the webhook route's inline path so both behave identically. It owns the event's
        // terminal status and throws only on transient errors (which BullMQ then retries).
        const { FacebookIngestionService } = await import("@/domains/leads/facebookIngestionService");
        return await FacebookIngestionService.processEvent(event);
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
