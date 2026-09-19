import { describe, expect, it } from "vitest";
import { IframePostMessageWorker } from "./iframePostMessageWorker";

describe("IframePostMessageWorker (Cross-Origin Iframe Integration)", () => {
  it("should validate allowed origin domains correctly", () => {
    expect(IframePostMessageWorker.isAllowedOrigin("https://example.com", ["*"])).toBe(true);
    expect(IframePostMessageWorker.isAllowedOrigin("https://sub.mywebsite.com", ["mywebsite.com"])).toBe(true);
    expect(IframePostMessageWorker.isAllowedOrigin("https://malicious.com", ["mywebsite.com"])).toBe(false);
  });

  it("should reject submissions from a disallowed origin before touching the pipeline", async () => {
    const res = await IframePostMessageWorker.processIframePostMessage(
      "https://malicious.com",
      { type: "PRIVYR_LEAD_SUBMISSION", tenantId: "t1", data: { sourceId: "s1", email: "a@b.com" } },
      ["mywebsite.com"],
    );
    expect(res.success).toBe(false);
    expect(res.allowedOrigin).toBe(false);
  });

  it("should reject a malformed payload", async () => {
    const res = await IframePostMessageWorker.processIframePostMessage("https://ok.com", {
      type: "NOT_A_LEAD",
      data: { email: "a@b.com" },
    } as any);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid/i);
  });

  it("should reject an embed missing its tenant or source id (no fake success)", async () => {
    const res = await IframePostMessageWorker.processIframePostMessage("https://ok.com", {
      type: "PRIVYR_LEAD_SUBMISSION",
      data: { name: "Arthur", email: "arthur@earth.org" }, // no tenantId / sourceId
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/misconfigured/i);
  });

  it("should reject a lead with neither email nor phone", async () => {
    const res = await IframePostMessageWorker.processIframePostMessage("https://ok.com", {
      type: "PRIVYR_LEAD_SUBMISSION",
      tenantId: "t1",
      data: { name: "No Contact", sourceId: "s1" },
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/email or phone/i);
  });

  it("should generate postMessage acknowledgment payload for parent window", () => {
    const ack = IframePostMessageWorker.createAckMessage({
      success: true,
      eventId: "evt_999",
      allowedOrigin: true,
    }, "PRIVYR_LEAD_SUBMISSION");

    expect(ack.type).toBe("PRIVYR_LEAD_ACK");
    expect(ack.status).toBe("success");
    expect(ack.eventId).toBe("evt_999");

    const ridhzoAck = IframePostMessageWorker.createAckMessage({
      success: true,
      eventId: "evt_888",
      allowedOrigin: true,
    }, "RIDHZO_LEAD_SUBMISSION");
    expect(ridhzoAck.type).toBe("RIDHZO_LEAD_ACK");
  });
});
