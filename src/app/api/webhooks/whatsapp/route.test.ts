import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

// H10: inbound WhatsApp must be authenticated; unauthenticated deliveries are refused in production.
const recordInbound = vi.fn(async () => ({ matched: false }));
vi.mock("@/lib/messaging/whatsapp/service", () => ({ WhatsAppService: { recordInbound: (...a: unknown[]) => (recordInbound as any)(...a), updateStatus: vi.fn() } }));
vi.mock("@/lib/messaging/whatsapp/parse", () => ({ parseWebhook: () => ({ messages: [{ from: "919876500001", id: "m1", body: "hi" }], statuses: [] }) }));
vi.mock("@/domains/leads/inboundIntentService", () => ({ InboundIntentService: { classifyAndTag: vi.fn() } }));

import { POST } from "./route";

const body = JSON.stringify({ any: "thing" });
const req = (headers: Record<string, string> = {}, qs = "") => new NextRequest(`http://x/api/webhooks/whatsapp${qs}`, { method: "POST", body, headers });

describe("whatsapp inbound auth", () => {
  beforeEach(() => { recordInbound.mockClear(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WATXIO_APP_SECRET", ""); vi.stubEnv("WATXIO_VERIFY_TOKEN", ""); });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses everything in production when no secret or token is configured", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it("accepts a valid HMAC signature and rejects a bad one", async () => {
    vi.stubEnv("WATXIO_APP_SECRET", "s3cret");
    const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
    expect((await POST(req({ "x-hub-signature-256": sig }))).status).toBe(200);
    expect((await POST(req({ "x-hub-signature-256": "sha256=bad" }))).status).toBe(401);
  });

  it("falls back to the shared token when the provider can't sign", async () => {
    vi.stubEnv("WATXIO_VERIFY_TOKEN", "tok");
    expect((await POST(req({}, "?token=nope"))).status).toBe(401);
    expect((await POST(req({}, "?token=tok"))).status).toBe(200);
  });
});
