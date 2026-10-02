import { describe, it, expect, vi, beforeEach } from "vitest";

// H9: honeypot, CAPTCHA and the per-workspace ceiling protect the tenant's lead quota.
const insert = vi.fn();
const limit = vi.fn();
const turnstile = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }) }));
vi.mock("@/db", () => ({ db: { insert: (...a: unknown[]) => insert(...a) } }));
vi.mock("@/domains/leads/sourceService", () => ({ LeadSourceService: { getSource: async () => ({ id: "s", isActive: true, organizationId: "o1", name: "Form", config: {} }) } }));
vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: (k: string) => limit(k) } }));
vi.mock("@/lib/security/botCheck", () => ({ verifyTurnstile: (...a: unknown[]) => turnstile(...a) }));
vi.mock("@/lib/leads/formFields", () => ({ resolveFormFields: () => [], buildSubmission: () => ({ ok: true, values: { name: "A" } }) }));

import { submitPublicLeadAction } from "./publicLead";

describe("submitPublicLeadAction bot protection", () => {
  beforeEach(() => { vi.clearAllMocks(); limit.mockResolvedValue({ success: true }); turnstile.mockResolvedValue(true); insert.mockImplementation(() => { throw new Error("stored"); }); });

  it("pretends success but stores nothing when the honeypot is filled", async () => {
    expect(await submitPublicLeadAction("s", { name: "A", _hp: "http://spam" })).toMatchObject({ ok: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a failed CAPTCHA", async () => {
    turnstile.mockResolvedValue(false);
    expect(await submitPublicLeadAction("s", { name: "A", _cf: "bad" })).toMatchObject({ ok: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses once the workspace-wide hourly ceiling is hit", async () => {
    limit.mockImplementation(async (k: string) => ({ success: !k.startsWith("public-form-org:") }));
    expect(await submitPublicLeadAction("s", { name: "A" })).toMatchObject({ ok: false, code: "RATE_LIMIT" });
    expect(insert).not.toHaveBeenCalled();
  });
});
