import { describe, it, expect, vi, beforeEach } from "vitest";

// C2: only leads the caller may act on, in the caller's workspace, are messaged — and only with leads.edit.
const requirePermission = vi.fn();
const filter = vi.fn();
const send = vi.fn();
vi.mock("@/lib/rbac", () => ({ assertWritable: async () => ({}), requirePermission: (k: string) => requirePermission(k) }));
vi.mock("@/lib/leads/access", () => ({ filterAccessibleLeadIds: (...a: unknown[]) => filter(...a) }));
vi.mock("@/lib/messaging/whatsapp/service", () => ({ WhatsAppService: { send: (...a: unknown[]) => send(...a) } }));
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { sendCampaignAction } from "./campaigns";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("sendCampaignAction", () => {
  beforeEach(() => { vi.clearAllMocks(); requirePermission.mockResolvedValue({ userId: "u1", organizationId: "o1" }); });

  it("sends only to leads that pass the access filter, scoped to the caller's org", async () => {
    filter.mockResolvedValue([A]);
    send.mockResolvedValue({});
    const r = await sendCampaignAction({ leadIds: [A, B], body: "hi" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ leadId: A, organizationId: "o1" }));
    expect(r).toMatchObject({ ok: true });
  });

  it("sends nothing when no lead is accessible", async () => {
    filter.mockResolvedValue([]);
    const r = await sendCampaignAction({ leadIds: [B], body: "hi" });
    expect(send).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("refuses a role without leads.edit", async () => {
    requirePermission.mockRejectedValue(new Error("Forbidden"));
    await expect(sendCampaignAction({ leadIds: [A], body: "hi" })).rejects.toThrow("Forbidden");
    expect(send).not.toHaveBeenCalled();
  });
});
