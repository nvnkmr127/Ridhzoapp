import { describe, it, expect, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { toClientSource } from "./sourceService";

const row = (type: string, config: Record<string, unknown> = {}) =>
  ({ id: "s1", name: "S", type, isActive: 1, webhookSecret: "sec", config, organizationId: "o", createdAt: new Date() }) as any;

describe("toClientSource", () => {
  it("never sends the Facebook Page token, nor a secret Facebook doesn't use", () => {
    const out = toClientSource(row("facebook_lead_ads", { pageId: "p", pageAccessToken: "enc", formFilter: ["f"] }));
    expect(out.config).toEqual({ pageId: "p", formFilter: ["f"] });
    expect(out.webhookSecret).toBeNull();
  });

  it("keeps the secret for webhook and Google sources (their setup needs it)", () => {
    expect(toClientSource(row("generic_webhook")).webhookSecret).toBe("sec");
    expect(toClientSource(row("google_lead_ads")).webhookSecret).toBe("sec");
    expect(toClientSource(row("webform")).webhookSecret).toBeNull();
  });
});
