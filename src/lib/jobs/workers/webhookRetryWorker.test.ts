import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import { calculateBackoffDelayMs, processWebhookDeliveryJob, WebhookRetryJobData } from "./webhookRetryWorker";
import { LeadWebhookEventService } from "@/domains/leads/leadWebhookEventService";

vi.mock("@/domains/leads/leadWebhookEventService", () => ({
  LeadWebhookEventService: { dispatchWebhook: vi.fn() },
}));

// Delivery-row updates are a no-op in these tests (job carries no deliveryId), but the worker imports
// the DB-backed DLQ service — stub it so nothing touches Postgres.
vi.mock("@/domains/leads/webhookDlqService", () => ({
  WebhookDlqService: { markResult: vi.fn().mockResolvedValue(undefined) },
}));

function job(overrides: Partial<WebhookRetryJobData> = {}): any {
  return {
    id: "job-wh",
    attemptsMade: 1,
    opts: { attempts: 5 },
    data: {
      endpointUrl: "https://example.com/hooks",
      webhookSecret: "secret123",
      payload: {
        eventId: "evt_123",
        event: "lead.created",
        timestamp: new Date().toISOString(),
        organizationId: "org-1",
        data: { name: "Test Lead" },
      },
      ...overrides,
    },
  };
}

describe("Webhook Retry Worker & Exponential Backoff Architecture", () => {
  it("calculates exponential backoff with a cap", () => {
    expect(calculateBackoffDelayMs(1)).toBe(1000);
    expect(calculateBackoffDelayMs(2)).toBe(2000);
    expect(calculateBackoffDelayMs(3)).toBe(4000);
    expect(calculateBackoffDelayMs(4)).toBe(8000);
    expect(calculateBackoffDelayMs(7)).toBe(60000); // capped
  });

  it("delivers on a 2xx response", async () => {
    (LeadWebhookEventService.dispatchWebhook as any).mockResolvedValueOnce({ success: true, statusCode: 200 });
    const result = await processWebhookDeliveryJob(job());
    expect(result.delivered).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("throws a retryable error on a transient (5xx) failure", async () => {
    (LeadWebhookEventService.dispatchWebhook as any).mockResolvedValueOnce({ success: false, statusCode: 500, permanent: false, errorReason: "Endpoint returned status 500" });
    const p = processWebhookDeliveryJob(job());
    await expect(p).rejects.toThrow(/status 500/);
    await expect(p).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it("throws UnrecoverableError on a permanent (4xx) failure so BullMQ stops", async () => {
    (LeadWebhookEventService.dispatchWebhook as any).mockResolvedValueOnce({ success: false, statusCode: 400, permanent: true, errorReason: "Endpoint returned status 400" });
    await expect(processWebhookDeliveryJob(job())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("propagates a transport error so BullMQ retries", async () => {
    (LeadWebhookEventService.dispatchWebhook as any).mockRejectedValueOnce(new Error("ETIMEDOUT"));
    await expect(processWebhookDeliveryJob(job())).rejects.toThrow(/ETIMEDOUT/);
  });
});
