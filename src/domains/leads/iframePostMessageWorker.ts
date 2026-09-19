import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { ingestionQueue } from "@/lib/jobs/workers/ingestionWorker";

export interface IframeMessagePayload {
  type: string;
  tenantId?: string;
  sourceId?: string;
  source?: string;
  data: {
    name?: string;
    email?: string;
    phone?: string;
    sourceId?: string;
    budget?: string | number;
    [key: string]: any;
  };
}

export interface IframeProcessingResult {
  success: boolean;
  eventId?: string;
  error?: string;
  allowedOrigin: boolean;
}

export class IframePostMessageWorker {
  /**
   * Validates whether the event origin domain is allowed for cross-origin postMessage messaging.
   */
  static isAllowedOrigin(origin: string, allowedOrigins: string[] = ["*"]): boolean {
    if (!origin) return false;
    if (allowedOrigins.includes("*")) return true;
    return allowedOrigins.some((domain) => origin === domain || origin.endsWith(`.${domain}`));
  }

  /**
   * Processes cross-origin postMessage events from embedded iframe lead widgets. The lead is
   * persisted through the SAME ingestion pipeline as webhooks/CSV (webhook_events → BullMQ →
   * adapter → dedupe → lead), so it is created for real — not a stub. Requires the embed to carry
   * its tenant + source id; a lead with no email or phone is rejected up front.
   */
  static async processIframePostMessage(
    origin: string,
    payload: IframeMessagePayload,
    allowedOrigins: string[] = ["*"]
  ): Promise<IframeProcessingResult> {
    if (!this.isAllowedOrigin(origin, allowedOrigins)) {
      return { success: false, error: "Cross-origin domain not allowed", allowedOrigin: false };
    }

    if ((payload.type !== "PRIVYR_LEAD_SUBMISSION" && payload.type !== "RIDHZO_LEAD_SUBMISSION") || !payload.data) {
      return { success: false, error: "Invalid postMessage event type or payload structure", allowedOrigin: true };
    }

    const organizationId = payload.tenantId;
    const sourceId = payload.data.sourceId || payload.sourceId;
    if (!organizationId || !sourceId) {
      return { success: false, error: "This embed is misconfigured (missing tenant or source id).", allowedOrigin: true };
    }
    if (!payload.data.email && !payload.data.phone) {
      return { success: false, error: "An email or phone number is required to capture this lead.", allowedOrigin: true };
    }

    try {
      // Store the event and hand it to the ingestion worker (provider "generic_webhook" runs the
      // GenericWebhookAdapter → dedupe → lead). sourceId + organizationId are folded into the payload
      // so the worker can attribute and tenant-scope it.
      const [event] = await db
        .insert(webhookEvents)
        .values({
          provider: "generic_webhook",
          payload: {
            ...payload.data,
            name: payload.data.name,
            email: payload.data.email,
            phone: payload.data.phone,
            sourceId,
            organizationId,
            source: payload.source || `Embedded Iframe (${origin})`,
            embed_origin: origin,
          },
        })
        .returning({ id: webhookEvents.id });

      await ingestionQueue.add(`ingest-${event.id}`, { webhookEventId: event.id });

      return { success: true, eventId: event.id, allowedOrigin: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Failed to process iframe lead submission",
        allowedOrigin: true,
      };
    }
  }

  /**
   * Generates postMessage acknowledgment payload to post back to the parent iframe window.
   */
  static createAckMessage(result: IframeProcessingResult, incomingType?: string): { type: string; status: string; eventId?: string; error?: string } {
    return {
      type: incomingType === "PRIVYR_LEAD_SUBMISSION" ? "PRIVYR_LEAD_ACK" : "RIDHZO_LEAD_ACK",
      status: result.success ? "success" : "error",
      eventId: result.eventId,
      error: result.error,
    };
  }
}
