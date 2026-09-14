import { describe, it, expect, vi, beforeEach } from "vitest";

// db.select().from().where() → queued rules. db.update().set().where() → recorded (soft-delete + rr cursor).
let ruleRows: any[] = [];
const updateSet = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(ruleRows) }) }),
    update: () => ({ set: (v: any) => { updateSet(v); return { where: () => Promise.resolve() }; } }),
  },
}));

const lead = { id: "lead-1", name: "Ada", email: "ada@x.com", phone: "+15551230000", company: "Acme", status: "new", sourceId: "src-fb", organizationId: "org-1", customData: { plan: "pro" } };
vi.mock("@/domains/leads/service", () => ({ LeadService: { getLeadById: vi.fn().mockResolvedValue(lead) } }));

const sendEmail = vi.fn();
vi.mock("@/lib/mail/mailer", () => ({ sendEmail: (...a: any[]) => sendEmail(...a), appUrl: (p: string) => `https://app.test${p}` }));

const notify = vi.fn();
vi.mock("@/domains/notifications/service", () => ({ NotificationService: { create: (...a: any[]) => notify(...a) } }));

import { LeadDistributionService } from "./leadDistributionService";

const rule = (over: Partial<any> = {}) => ({
  id: "r", sourceId: null, conditions: [], recipients: [{ channel: "email", value: "a@x.com" }],
  mode: "all", rrCursor: 0, skipSave: 0, isActive: 1, ...over,
});

describe("LeadDistributionService.distribute", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue(undefined);
    updateSet.mockReset();
    ruleRows = [];
  });

  it("matches on source + extra conditions and emails recipients", async () => {
    ruleRows = [rule({ sourceId: "src-fb", conditions: [{ field: "customData.plan", operator: "equals", value: "pro" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].html).toContain("https://app.test/leads/lead-1");
  });

  it("skips a rule whose extra condition fails", async () => {
    ruleRows = [rule({ conditions: [{ field: "status", operator: "equals", value: "won" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("routes in-app recipients to notifications", async () => {
    ruleRows = [rule({ recipients: [{ channel: "in_app", value: "user-9" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ userId: "user-9", leadId: "lead-1", type: "new_lead" });
  });

  it("round-robin sends to one recipient and advances the cursor", async () => {
    ruleRows = [rule({ mode: "round_robin", rrCursor: 1, recipients: [{ channel: "email", value: "a@x.com" }, { channel: "email", value: "b@x.com" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("b@x.com"); // cursor 1 → index 1
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ rrCursor: 0 })); // (1+1)%2
  });

  it("dedupes identical targets across rules", async () => {
    ruleRows = [rule({ recipients: [{ channel: "email", value: "dup@x.com" }] }), rule({ recipients: [{ channel: "email", value: "dup@x.com" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("soft-deletes the lead when a matching rule sets skipSave", async () => {
    ruleRows = [rule({ skipSave: 1 })];
    await LeadDistributionService.distribute("lead-1");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
  });

  it("no-ops when no rule matches", async () => {
    ruleRows = [rule({ sourceId: "src-other" })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
