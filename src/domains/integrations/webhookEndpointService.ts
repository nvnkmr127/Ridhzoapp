import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { LeadWebhookEventService, WebhookEventPayload } from "@/domains/leads/leadWebhookEventService";
import { WebhookDlqService } from "@/domains/leads/webhookDlqService";
// No static `crypto` import — reachable from instrumentation's edge-compiled graph. Lazy-load it.

// The lead events an outbound webhook can subscribe to. Only events with a real producer belong
// here — `lead.hot_threshold` / `lead.stagnant_alert` are NOT emitted anywhere yet, so offering them
// would let customers subscribe to something that never fires. Re-add each when its producer lands.
export const WEBHOOK_EVENT_TYPES = [
  "lead.created",
  "lead.status_changed",
  "lead.assigned",
  "meeting.scheduled",
  "meeting.rescheduled",
  "meeting.completed",
  "meeting.no_show",
  "meeting.cancelled",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export class WebhookEndpointService {
  // Never ship the signing secret in the listing — it would sit in the client props/DOM on every
  // page load. The UI fetches it on demand via `revealSecret` (Copy button) instead.
  static list(organizationId: string) {
    return db
      .select({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        createdAt: webhookEndpoints.createdAt,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.organizationId, organizationId));
  }

  // On-demand secret reveal for the Copy button. Org-scoped so one tenant can't read another's secret.
  static async revealSecret(organizationId: string, id: string): Promise<string | null> {
    const [row] = await db
      .select({ secret: webhookEndpoints.secret })
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)));
    return row?.secret ?? null;
  }

  static async create(organizationId: string, url: string, events: string[]) {
    const { assertPublicHttpUrl } = await import("@/lib/webhooks/ssrf");
    await assertPublicHttpUrl(url);
    const { randomBytes } = await import("crypto");
    const secret = randomBytes(24).toString("hex");
    const [row] = await db
      .insert(webhookEndpoints)
      .values({ organizationId, url, secret, events })
      .returning();
    return row;
  }

  static async setActive(organizationId: string, id: string, isActive: boolean) {
    const [row] = await db
      .update(webhookEndpoints)
      .set({ isActive: isActive ? 1 : 0 })
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)))
      .returning();
    return row;
  }

  static async remove(organizationId: string, id: string) {
    await db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)));
  }

  static async test(
    organizationId: string,
    id: string
  ): Promise<{ success: boolean; statusCode: number; error?: string }> {
    const [row] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, organizationId)));

    if (!row) {
      return { success: false, statusCode: 0, error: "Webhook endpoint not found." };
    }

    const event = (row.events?.[0] as WebhookEventType) || "lead.created";
    const payload: WebhookEventPayload = LeadWebhookEventService.constructPayload(organizationId, event, {
      id: `lead-test-${Date.now()}`,
      name: "Test Lead",
      email: "test@example.com",
      phone: "+15551234567",
      company: "Acme Corp",
      status: "new",
      source: "Webhook Test",
    });

    const result = await LeadWebhookEventService.dispatchWebhook(row.url, row.secret, payload);
    return {
      success: result.success,
      statusCode: result.statusCode,
      error: result.success
        ? undefined
        : result.permanent && result.statusCode === 0
          ? result.errorReason ?? "Webhook URL was rejected."
          : result.statusCode === 0
          ? "Could not reach webhook URL (network error or timeout)."
          : `Endpoint responded with HTTP ${result.statusCode}.`,
    };
  }

  // Producer: enqueue a signed delivery to every active endpoint in this org that subscribed to
  // `event`. Never throws into the caller (an event handler). Durability: we write a `pending`
  // delivery row to Postgres BEFORE enqueue, so if the queue (Redis) is unreachable the event
  // surfaces as a `failed` row the customer can see — it is no longer silently dropped.
  // ponytail: per-target insert+enqueue is O(n) round-trips; batch-insert if org fan-out ever grows large.
  static async dispatch(organizationId: string, event: WebhookEventType, data: Record<string, any>): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.organizationId, organizationId), eq(webhookEndpoints.isActive, 1)));
      const targets = rows.filter((r) => (r.events ?? []).includes(event));
      if (targets.length === 0) return;

      const payload: WebhookEventPayload = LeadWebhookEventService.constructPayload(organizationId, event, data);
      const { webhookDeliveryQueue } = await import("@/lib/jobs/workers/webhookRetryWorker");

      for (const t of targets) {
        let deliveryId: string | undefined;
        try {
          deliveryId = await WebhookDlqService.recordPending({
            organizationId,
            endpointId: t.id,
            eventId: payload.eventId,
            event,
            url: t.url,
            payload,
          });
        } catch (e) {
          console.error("[webhook-dispatch] could not record delivery row", e);
        }
        try {
          const job = await webhookDeliveryQueue.add(`wh-${t.id}-${payload.eventId}`, {
            deliveryId,
            endpointId: t.id,
            endpointUrl: t.url,
            webhookSecret: t.secret,
            payload,
          });
          if (deliveryId) await WebhookDlqService.markResult(deliveryId, { status: "pending", jobId: String(job.id) });
        } catch (e) {
          console.error("[webhook-dispatch] enqueue failed — recording as failed delivery", e);
          if (deliveryId) {
            await WebhookDlqService.markResult(deliveryId, {
              status: "failed",
              errorReason: "Could not enqueue delivery (queue unavailable).",
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("[webhook-dispatch] failed to enqueue deliveries", e);
    }
  }
}
