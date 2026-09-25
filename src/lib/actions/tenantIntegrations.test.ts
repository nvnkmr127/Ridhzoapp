import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { updateCapiAction, updateEnrichmentAction } from "./tenantIntegrations";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { EmailInboundService } from "@/domains/leads/emailInboundService";
import { POST } from "@/app/api/webhooks/email/route";

vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domains/organizations/tenantIntegrationsService", () => ({
  DEFAULT_AUTH_HEADER: "Authorization",
  TenantIntegrationsService: {
    upsertCapi: vi.fn().mockResolvedValue({}),
    upsertEnrichment: vi.fn().mockResolvedValue({}),
    resolveInboundToken: vi.fn().mockResolvedValue({ organizationId: "org-1" }),
  },
}));
vi.mock("@/domains/leads/emailInboundService", () => ({
  EmailInboundService: { recordInbound: vi.fn().mockResolvedValue({ matched: false }) },
}));
vi.mock("@/domains/leads/inboundIntentService", () => ({ InboundIntentService: { classifyAndTag: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("lead intelligence settings: blank fields clear", () => {
  it("a blank test event code is saved as null (events go live again)", async () => {
    await updateCapiAction({ pixelId: "123", testEventCode: "", enabled: true });
    expect(TenantIntegrationsService.upsertCapi).toHaveBeenCalledWith("org-1", expect.objectContaining({ testEventCode: null }));
  });

  it("a blank provider URL is saved as null", async () => {
    await updateEnrichmentAction({ apiUrl: "", authHeader: "", enabled: false });
    expect(TenantIntegrationsService.upsertEnrichment).toHaveBeenCalledWith("org-1", expect.objectContaining({ apiUrl: null, authHeader: null }));
  });

  it("rejects a private provider URL (SSRF)", async () => {
    const res = await updateEnrichmentAction({ apiUrl: "https://127.0.0.1/x", authHeader: "", enabled: false });
    expect(res.ok).toBe(false);
    expect(TenantIntegrationsService.upsertEnrichment).not.toHaveBeenCalled();
  });
});

describe("inbound email webhook body formats", () => {
  const url = "https://app.test/api/webhooks/email?token=t";

  it("parses form data (Mailgun / SendGrid)", async () => {
    const form = new FormData();
    form.set("sender", "a@b.com");
    form.set("subject", "Hi");
    form.set("body-plain", "hello");
    await POST(new NextRequest(url, { method: "POST", body: form }));
    expect(EmailInboundService.recordInbound).toHaveBeenCalledWith(expect.objectContaining({ from: "a@b.com", subject: "Hi", body: "hello" }));
  });

  it("unwraps the Resend event envelope", async () => {
    const body = JSON.stringify({ type: "email.received", data: { from: "Ada <a@b.com>", subject: "Re: demo", text: "yes" } });
    await POST(new NextRequest(url, { method: "POST", body, headers: { "content-type": "application/json" } }));
    expect(EmailInboundService.recordInbound).toHaveBeenCalledWith(expect.objectContaining({ from: "Ada <a@b.com>", subject: "Re: demo", body: "yes" }));
  });
});
