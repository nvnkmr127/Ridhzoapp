import { Queue, Worker, Job, UnrecoverableError } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { webhookEndpoints } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { LeadWebhookEventService, WebhookEventPayload } from "@/domains/leads/leadWebhookEventService";
import { WebhookDlqService } from "@/domains/leads/webhookDlqService";

export const WEBHOOK_DELIVERY_QUEUE_NAME = "webhook-delivery";
export const WEBHOOK_MAX_ATTEMPTS = 5;

export interface WebhookRetryJobData {
  deliveryId?: string; // row in webhook_deliveries this job updates
  endpointId?: string;
  endpointUrl: string;
  webhookSecret: string;
  payload: WebhookEventPayload;
}

const connection = createRedis({ maxRetriesPerRequest: null });

// Deliveries retry with exponential backoff via BullMQ's own attempts/backoff. Failed jobs are
// bounded in Redis (durable state lives in the webhook_deliveries table, so we don't need to keep
// every failed job forever) and the delivery row is flipped to `failed` for the settings UI/DLQ.
export const webhookDeliveryQueue = new Queue<WebhookRetryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: WEBHOOK_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: { count: 5000 }, // bound Redis; the durable record is in Postgres
  },
});

// Exposed for reference/tests; BullMQ applies the same exponential curve via `backoff` above.
export function calculateBackoffDelayMs(attempt: number, baseDelayMs = 1000, maxDelayMs = 60000): number {
  return Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
}

// Delivers one webhook. THROWS on a transient failure so BullMQ retries per backoff; throws
// UnrecoverableError on a permanent failure (bad URL, 4xx) so BullMQ stops immediately.
export async function processWebhookDeliveryJob(job: Job<WebhookRetryJobData>) {
  const { deliveryId, endpointId, payload } = job.data;
  let url = job.data.endpointUrl;
  let secret = job.data.webhookSecret;

  // Re-check the endpoint at delivery time so Disable/Delete actually stops in-flight jobs and a
  // rotated secret takes effect. Org-scoped by the payload's org — never trust the id alone.
  if (endpointId) {
    const [ep] = await db
      .select({ isActive: webhookEndpoints.isActive, url: webhookEndpoints.url, secret: webhookEndpoints.secret })
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.organizationId, payload.organizationId)));
    if (!ep) {
      await WebhookDlqService.markResult(deliveryId!, { status: "skipped", errorReason: "Endpoint was deleted before delivery." });
      return { skipped: true, reason: "deleted" };
    }
    if (!ep.isActive) {
      await WebhookDlqService.markResult(deliveryId!, { status: "skipped", errorReason: "Endpoint was disabled before delivery." });
      return { skipped: true, reason: "disabled" };
    }
    url = ep.url;
    secret = ep.secret;
  }

  const result = await LeadWebhookEventService.dispatchWebhook(url, secret, payload);
  const attempts = (job.attemptsMade ?? 0) + 1;

  if (result.success) {
    await WebhookDlqService.markResult(deliveryId!, { status: "delivered", attempts, statusCode: result.statusCode, jobId: String(job.id) });
    return { delivered: true, statusCode: result.statusCode };
  }

  // Record this attempt (row stays pending until retries exhaust or it's permanent — the `failed`
  // handler flips it to failed so there's one terminal writer).
  await WebhookDlqService.markResult(deliveryId!, {
    status: "pending",
    attempts,
    statusCode: result.statusCode,
    errorReason: result.errorReason ?? `Endpoint returned status ${result.statusCode}`,
    jobId: String(job.id),
  });

  const message = result.errorReason ?? `Endpoint returned status ${result.statusCode}`;
  if (result.permanent) throw new UnrecoverableError(message);
  throw new Error(message);
}

let worker: Worker<WebhookRetryJobData> | undefined;

export function createWebhookRetryWorker(): Worker<WebhookRetryJobData> {
  if (worker) return worker;
  worker = new Worker<WebhookRetryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, processWebhookDeliveryJob, {
    connection,
    concurrency: 5,
  });
  worker.on("failed", (job, err) => {
    if (!job) return;
    const permanent = err instanceof UnrecoverableError;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? WEBHOOK_MAX_ATTEMPTS);
    if (!permanent && !exhausted) return; // still has retries left
    // Terminal: flip the delivery row to failed (durable DLQ, read by the web tier).
    void WebhookDlqService.markResult(job.data.deliveryId!, {
      status: "failed",
      attempts: job.attemptsMade,
      errorReason: err.message,
    });
  });
  quietErrors(worker);
  return worker;
}
