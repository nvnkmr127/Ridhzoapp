import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import { WebhookEventPayload } from "@/domains/leads/leadWebhookEventService";
import { and, desc, eq, sql } from "drizzle-orm";

// A permanently-failed (or in-flight) outbound delivery, as the settings UI consumes it. Backed by
// the `webhook_deliveries` table so the web tier (Vercel) and worker (droplet) see the SAME state —
// the previous in-memory store lived only in whichever process wrote it, so the web DLQ was always
// empty. `jobId` here is the delivery row id (stable, tenant-scoped) used for retry/purge.
export interface DlqItem {
  jobId: string;
  eventId: string;
  event: WebhookEventPayload["event"];
  endpointUrl: string;
  failedAt: string;
  errorReason: string;
  attemptCount: number;
  payload: WebhookEventPayload;
}

export type DeliveryStatus = "pending" | "delivered" | "failed" | "skipped";

export interface RecordPendingInput {
  organizationId: string;
  endpointId?: string;
  eventId: string;
  event: string;
  url: string;
  payload: WebhookEventPayload;
}

export class WebhookDlqService {
  // Insert a `pending` delivery row BEFORE enqueue, so a Redis/enqueue failure downstream can be
  // recorded against a durable row instead of vanishing. Returns the row id (the job's deliveryId).
  static async recordPending(input: RecordPendingInput): Promise<string> {
    const [row] = await db
      .insert(webhookDeliveries)
      .values({
        organizationId: input.organizationId,
        endpointId: input.endpointId,
        eventId: input.eventId,
        event: input.event,
        url: input.url,
        status: "pending",
        payload: input.payload,
      })
      .returning({ id: webhookDeliveries.id });
    return row.id;
  }

  // Update a delivery row's outcome. `attempts`/`statusCode`/`errorReason`/`jobId` are optional so a
  // per-attempt update and a terminal update share one path.
  static async markResult(
    deliveryId: string,
    fields: { status: DeliveryStatus; attempts?: number; statusCode?: number | null; errorReason?: string | null; jobId?: string },
  ): Promise<void> {
    if (!deliveryId) return;
    await db
      .update(webhookDeliveries)
      .set({
        status: fields.status,
        ...(fields.attempts !== undefined ? { attempts: fields.attempts } : {}),
        ...(fields.statusCode !== undefined ? { lastStatusCode: fields.statusCode } : {}),
        ...(fields.errorReason !== undefined ? { errorReason: fields.errorReason } : {}),
        ...(fields.jobId !== undefined ? { jobId: fields.jobId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  }

  static async countFailed(organizationId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.organizationId, organizationId), eq(webhookDeliveries.status, "failed")));
    return row?.n ?? 0;
  }

  static async getDeliveryStats(organizationId: string): Promise<{ delivered: number; failed: number; pending: number }> {
    const rows = await db
      .select({ status: webhookDeliveries.status, n: sql<number>`count(*)::int` })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.organizationId, organizationId))
      .groupBy(webhookDeliveries.status);
    const out = { delivered: 0, failed: 0, pending: 0 };
    for (const r of rows) {
      if (r.status === "delivered") out.delivered = r.n;
      else if (r.status === "failed") out.failed = r.n;
      else if (r.status === "pending") out.pending = r.n;
    }
    return out;
  }

  // Tenant-scoped: only this org's failed deliveries.
  static async getFailedDlqJobs(organizationId: string): Promise<DlqItem[]> {
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.organizationId, organizationId), eq(webhookDeliveries.status, "failed")))
      .orderBy(desc(webhookDeliveries.updatedAt));
    return rows.map((r) => ({
      jobId: r.id,
      eventId: r.eventId,
      event: r.event as WebhookEventPayload["event"],
      endpointUrl: r.url,
      failedAt: (r.updatedAt ?? r.createdAt).toISOString(),
      errorReason: r.errorReason ?? "Unknown error",
      attemptCount: r.attempts,
      payload: r.payload as WebhookEventPayload,
    }));
  }

  // Re-enqueue a failed delivery for another try. Loads the row org-scoped (so org A can't retry org
  // B's delivery), flips it back to pending, and re-adds the job carrying its own deliveryId.
  static async retryDlqJob(deliveryId: string, organizationId: string): Promise<{ success: boolean; message: string }> {
    const [row] = await db
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.organizationId, organizationId)));
    if (!row) throw new Error(`DLQ delivery ${deliveryId} not found`);

    await db
      .update(webhookDeliveries)
      .set({ status: "pending", attempts: 0, errorReason: null, updatedAt: new Date() })
      .where(eq(webhookDeliveries.id, deliveryId));

    const { webhookDeliveryQueue } = await import("@/lib/jobs/workers/webhookRetryWorker");
    const payload = row.payload as WebhookEventPayload;
    await webhookDeliveryQueue.add(`wh-retry-${deliveryId}`, {
      deliveryId,
      endpointId: row.endpointId ?? undefined,
      endpointUrl: row.url,
      webhookSecret: "", // resolved from the endpoint at delivery time; empty forces a fresh lookup
      payload,
    });
    return { success: true, message: `Re-enqueued delivery ${deliveryId} (${row.event}).` };
  }

  static async purgeDlqJob(deliveryId: string, organizationId: string): Promise<{ success: boolean; message: string }> {
    const deleted = await db
      .delete(webhookDeliveries)
      .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.organizationId, organizationId)))
      .returning({ id: webhookDeliveries.id });
    if (deleted.length === 0) throw new Error(`DLQ delivery ${deliveryId} not found`);
    return { success: true, message: `Purged delivery ${deliveryId}.` };
  }
}
