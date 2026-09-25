import { describe, it, expect, vi, beforeEach } from "vitest";

// db.update(...).set(...).where(...).returning() resolves to the queued row list.
let returning: any[] = [];
const setCalls: any[] = [];
vi.mock("@/db", () => ({
  db: {
    update: () => ({ set: (v: any) => { setCalls.push(v); return { where: () => ({ returning: async () => returning }) }; } }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));
vi.mock("@/domains/leads/ownership", () => ({ orgLeadIds: () => ({}), assertLeadInOrg: vi.fn() }));
const markLeadContacted = vi.fn();
vi.mock("@/domains/follow-ups/state", () => ({ syncLeadFollowUpState: vi.fn(), markLeadContacted: (...a: any[]) => markLeadContacted(...a) }));
const emit = vi.fn();
vi.mock("@/lib/events/emitter", () => ({ eventBus: { emit: (...a: any[]) => emit(...a) } }));

import { FollowUpService } from "./service";

const row = (type: string) => ({ id: "f1", leadId: "l1", userId: "u1", type, title: "T", completedAt: new Date() });

describe("FollowUpService.completeFollowUp", () => {
  beforeEach(() => { returning = []; setCalls.length = 0; markLeadContacted.mockReset(); emit.mockReset(); });

  it("does nothing (no events) when the follow-up isn't pending any more", async () => {
    returning = [];
    expect(await FollowUpService.completeFollowUp("f1", "org")).toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
    expect(markLeadContacted).not.toHaveBeenCalled();
  });

  it("a completed call counts as contacting the lead", async () => {
    returning = [row("call")];
    await FollowUpService.completeFollowUp("f1", "org");
    expect(markLeadContacted).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith("follow_up.completed", expect.objectContaining({ followUpId: "f1" }));
  });

  it("a completed task is not a contact and fires task.completed (any casing)", async () => {
    returning = [row("Task")];
    await FollowUpService.completeFollowUp("f1", "org");
    expect(markLeadContacted).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("task.completed", expect.anything());
  });
});

describe("FollowUpService.snoozeFollowUp", () => {
  it("rejects an invalid date instead of writing it", async () => {
    await expect(FollowUpService.snoozeFollowUp("f1", new Date("nope"), "org")).rejects.toThrow(/invalid/i);
  });
});
