import { describe, it, expect, vi, beforeEach } from "vitest";

// Access rule + contact logging for lead messaging actions.
const getActionableLead = vi.fn();
vi.mock("@/lib/leads/access", () => ({ getActionableLead: (id: string) => getActionableLead(id) }));

const addActivity = vi.fn();
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: (a: unknown) => addActivity(a) } }));

const markLeadContacted = vi.fn();
vi.mock("@/domains/follow-ups/state", () => ({ markLeadContacted: (id: string) => markLeadContacted(id) }));

const waInsert = vi.fn();
vi.mock("@/db", () => ({ db: { insert: () => ({ values: (v: unknown) => waInsert(v) }) } }));

const waSend = vi.fn();
vi.mock("@/lib/messaging/whatsapp/service", () => ({ WhatsAppService: { send: (i: unknown) => waSend(i) } }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", () => ({ requireOrg: vi.fn(), requirePermission: vi.fn() }));

import { logLeadContactAction, sendWhatsAppAction } from "./messaging";

const LEAD = "6f1c2e0a-1111-4222-8333-444455556666";
const access = { lead: { id: LEAD, email: "a@b.com" }, userId: "u1", organizationId: "org-1" };

describe("lead messaging actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("won't send WhatsApp for a lead the user can't act on (other tenant / not assigned)", async () => {
    getActionableLead.mockResolvedValueOnce(null);
    const res = await sendWhatsAppAction({ leadId: LEAD, body: "hi" });
    expect(res.ok).toBe(false);
    expect(waSend).not.toHaveBeenCalled();
  });

  it("logs a call and marks the lead contacted", async () => {
    getActionableLead.mockResolvedValueOnce(access);
    const res = await logLeadContactAction({ leadId: LEAD, channel: "call", outcome: "no_answer", note: "try after 5" });
    expect(res.ok).toBe(true);
    expect(addActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "call", content: "Called — No answer\nNote: try after 5" }));
    expect(markLeadContacted).toHaveBeenCalledWith(LEAD);
  });

  it("does not count a wrong number as contact", async () => {
    getActionableLead.mockResolvedValueOnce(access);
    await logLeadContactAction({ leadId: LEAD, channel: "call", outcome: "wrong_number" });
    expect(addActivity).toHaveBeenCalled();
    expect(markLeadContacted).not.toHaveBeenCalled();
  });

  it("puts a personal-mode WhatsApp message in the thread", async () => {
    getActionableLead.mockResolvedValueOnce(access);
    await logLeadContactAction({ leadId: LEAD, channel: "whatsapp", message: "Hi Priya" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, direction: "outbound", body: "Hi Priya", status: "sent" }));
    expect(markLeadContacted).toHaveBeenCalled();
  });

  it("refuses to log contact on a lead the user can't act on", async () => {
    getActionableLead.mockResolvedValueOnce(null);
    const res = await logLeadContactAction({ leadId: LEAD, channel: "email" });
    expect(res.ok).toBe(false);
    expect(addActivity).not.toHaveBeenCalled();
  });
});
