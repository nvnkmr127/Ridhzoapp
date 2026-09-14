import { describe, it, expect, vi, beforeEach } from "vitest";

// db mock: select→rules, update→record set(), insert→record delivery rows.
let ruleRows: any[] = [];
const updateSet = vi.fn();
const insertValues = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(ruleRows) }) }),
    update: () => ({ set: (v: any) => { updateSet(v); return { where: () => Promise.resolve() }; } }),
    insert: () => ({ values: (v: any) => { insertValues(v); return Promise.resolve(); } }),
  },
}));

const lead = { id: "lead-1", name: "Ada", email: "ada@x.com", phone: "+15551230000", company: "Acme", status: "new", sourceId: "src-fb", organizationId: "org-1", customData: { plan: "pro" } };
vi.mock("@/domains/leads/service", () => ({ LeadService: { getLeadById: vi.fn().mockResolvedValue(lead) } }));
vi.mock("@/domains/tags/service", () => ({ TagService: { getForLead: vi.fn().mockResolvedValue([{ name: "VIP" }]) } }));
vi.mock("@/domains/users/service", () => ({ UserService: { list: vi.fn().mockResolvedValue([{ id: "user-9" }]) } }));

const sendEmail = vi.fn();
vi.mock("@/lib/mail/mailer", () => ({ sendEmail: (...a: any[]) => sendEmail(...a), appUrl: (p: string) => `https://app.test${p}` }));
const notify = vi.fn();
vi.mock("@/domains/notifications/service", () => ({ NotificationService: { create: (...a: any[]) => notify(...a) } }));

import { LeadDistributionService } from "./leadDistributionService";

const rule = (over: Partial<any> = {}) => ({
  id: "r", name: null, sourceId: null, conditions: { type: "AND", conditions: [] },
  recipients: [{ channel: "email", value: "a@x.com" }], mode: "all", rrCursor: 0, skipSave: 0, isActive: 1, ...over,
});

describe("LeadDistributionService.distribute", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    notify.mockReset().mockResolvedValue(undefined);
    updateSet.mockReset();
    insertValues.mockReset();
    ruleRows = [];
  });

  it("matches an AND group and logs a sent delivery", async () => {
    ruleRows = [rule({ conditions: { type: "AND", conditions: [{ field: "customData.plan", operator: "equals", value: "pro" }] } })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0][0]).toMatchObject({ status: "sent", channel: "email", ruleId: "r" });
  });

  it("OR group matches when any leaf passes", async () => {
    ruleRows = [rule({ conditions: { type: "OR", conditions: [{ field: "status", operator: "equals", value: "won" }, { field: "tag", operator: "contains", value: "vip" }] } })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips when an AND leaf fails", async () => {
    ruleRows = [rule({ conditions: { type: "AND", conditions: [{ field: "status", operator: "equals", value: "won" }] } })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("drops in_app recipients whose user is inactive (fairness)", async () => {
    ruleRows = [rule({ recipients: [{ channel: "in_app", value: "user-gone" }, { channel: "in_app", value: "user-9" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].userId).toBe("user-9");
  });

  it("round-robin advances over live recipients only", async () => {
    ruleRows = [rule({ mode: "round_robin", rrCursor: 0, recipients: [{ channel: "email", value: "a@x.com" }, { channel: "email", value: "b@x.com" }] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("a@x.com");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ rrCursor: 1 }));
  });

  it("soft-deletes on skipSave", async () => {
    ruleRows = [rule({ skipSave: 1 })];
    await LeadDistributionService.distribute("lead-1");
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
  });
});

describe("LeadDistributionService.sendTest", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    insertValues.mockReset();
  });

  it("sends to all recipients and reports counts", async () => {
    ruleRows = [rule({ recipients: [{ channel: "email", value: "a@x.com" }, { channel: "email", value: "b@x.com" }] })];
    const res = await LeadDistributionService.sendTest("org-1", "r");
    expect(res).toMatchObject({ ok: true, sent: 2, total: 2 });
    expect(insertValues.mock.calls[0][0][0]).toMatchObject({ isTest: 1, leadId: null });
  });

  it("fails when the rule has no deliverable recipients", async () => {
    ruleRows = [rule({ recipients: [{ channel: "in_app", value: "user-gone" }] })];
    const res = await LeadDistributionService.sendTest("org-1", "r");
    expect(res.ok).toBe(false);
  });
});
