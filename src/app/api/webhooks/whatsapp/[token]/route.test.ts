import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Per-tenant inbound: the token decides the workspace; replies are recorded against THAT workspace only.
const recordInbound = vi.fn(async () => ({ matched: false }));
const orgForToken = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: async () => ({ success: true }) } }));
vi.mock("@/lib/messaging/whatsapp/service", () => ({ WhatsAppService: { recordInbound: (...a: unknown[]) => (recordInbound as any)(...a), updateStatus: vi.fn() } }));
vi.mock("@/lib/messaging/whatsapp/parse", () => ({ parseWebhook: () => ({ messages: [{ from: "919876500001", id: "m1", body: "hi" }], statuses: [] }) }));
vi.mock("@/domains/organizations/whatsappSettingsService", () => ({ WhatsAppSettingsService: { orgForToken: (t: string) => orgForToken(t) } }));
vi.mock("@/domains/leads/inboundIntentService", () => ({ InboundIntentService: { classifyAndTag: vi.fn() } }));

import { POST } from "./route";

const call = (token: string) => POST(new NextRequest(`http://x/api/webhooks/whatsapp/${token}`, { method: "POST", body: "{}" }), { params: Promise.resolve({ token }) });

describe("per-tenant WhatsApp inbound", () => {
  beforeEach(() => { recordInbound.mockClear(); orgForToken.mockReset(); });

  it("404s an unknown token without recording anything", async () => {
    orgForToken.mockResolvedValue(null);
    expect((await call("nope-nope-nope-nope")).status).toBe(404);
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it("records replies against the token's workspace", async () => {
    orgForToken.mockResolvedValue("org-7");
    expect((await call("good-good-good-good")).status).toBe(200);
    expect(recordInbound).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-7", fromPhone: "919876500001" }));
  });
});
