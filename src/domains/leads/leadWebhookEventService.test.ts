import { describe, expect, it, vi } from "vitest";
import { LeadWebhookEventService } from "./leadWebhookEventService";

// The pinned SSRF-safe POST does real DNS; stub it so unit tests don't touch the network.
const pinnedPost = vi.fn();
vi.mock("@/lib/webhooks/ssrf", () => ({ pinnedPost: (...a: unknown[]) => pinnedPost(...a) }));

describe("LeadWebhookEventService", () => {
  it("should construct valid Webhook event payload with UUID eventId and ISO timestamp", () => {
    const payload = LeadWebhookEventService.constructPayload("org-100", "lead.created", {
      leadId: "lead-abc",
      name: "John Doe",
    });

    expect(payload.eventId).toMatch(/^evt_[a-f0-9]{32}$/);
    expect(payload.event).toBe("lead.created");
    expect(payload.organizationId).toBe("org-100");
    expect(payload.data.name).toBe("John Doe");
    expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
  });

  it("should generate HMAC-SHA256 signature for payload validation", async () => {
    const payload = LeadWebhookEventService.constructPayload("org-100", "lead.hot_threshold", {
      leadId: "lead-xyz",
      score: 95,
    });

    const signature = await LeadWebhookEventService.generateSignature(JSON.stringify(payload), "sec_secret_123");
    expect(signature).toHaveLength(64); // SHA-256 hex output is 64 chars
  });

  it("POSTs the signed payload and reports success on a 2xx", async () => {
    const payload = LeadWebhookEventService.constructPayload("org-100", "lead.stagnant_alert", {
      leadId: "lead-stagnant",
      daysStagnant: 14,
    });
    pinnedPost.mockReset().mockResolvedValue({ status: 202, text: "", tooLarge: false });

    const result = await LeadWebhookEventService.dispatchWebhook("https://example.com/webhook", "sec_secret_123", payload);

    expect(pinnedPost).toHaveBeenCalledOnce();
    const [url, init] = pinnedPost.mock.calls[0];
    expect(url).toBe("https://example.com/webhook");
    expect(init.headers["X-Ridhzo-Signature"]).toHaveLength(64);
    expect(init.headers["X-Privyr-Signature"]).toHaveLength(64);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(202);
  });

  it("reports failure on a non-2xx and on a network error", async () => {
    const payload = LeadWebhookEventService.constructPayload("org-100", "lead.created", { leadId: "l1" });

    pinnedPost.mockReset().mockResolvedValue({ status: 500, text: "", tooLarge: false });
    let result = await LeadWebhookEventService.dispatchWebhook("https://x/y", "s", payload);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);

    pinnedPost.mockReset().mockRejectedValue(new Error("ECONNREFUSED"));
    result = await LeadWebhookEventService.dispatchWebhook("https://x/y", "s", payload);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(0);
  });

  it("classifies 4xx (except 408/429) and 3xx as permanent, 5xx/408/429 as retryable", async () => {
    const payload = LeadWebhookEventService.constructPayload("org", "lead.created", {});
    const cases: [number, boolean][] = [
      [400, true], [404, true], [410, true], [422, true], [301, true], [302, true],
      [408, false], [429, false], [500, false], [502, false], [503, false],
    ];
    for (const [status, permanent] of cases) {
      pinnedPost.mockReset().mockResolvedValue({ status, text: "", tooLarge: false });
      const r = await LeadWebhookEventService.dispatchWebhook("https://x/y", "s", payload);
      expect(r.success).toBe(false);
      expect(r.permanent, `status ${status}`).toBe(permanent);
    }
  });

  it("stamps a payload version", () => {
    const p = LeadWebhookEventService.constructPayload("org", "lead.created", {});
    expect(p.version).toBe("1");
  });

  it("treats a private/reserved target as a permanent failure (no retries)", async () => {
    const payload = LeadWebhookEventService.constructPayload("org", "lead.created", {});
    pinnedPost.mockReset().mockRejectedValue(new Error("Webhook URL resolves to a private or reserved address."));
    const r = await LeadWebhookEventService.dispatchWebhook("http://internal.example/hook", "s", payload);
    expect(r).toMatchObject({ success: false, permanent: true, statusCode: 0 });
  });
});
