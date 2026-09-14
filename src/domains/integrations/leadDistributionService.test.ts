import { describe, it, expect, vi, beforeEach } from "vitest";

// db.select().from().where() resolves to the queued rules; db.update()... records soft-deletes.
let ruleRows: any[] = [];
const updateWhere = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(ruleRows) }) }),
    update: () => ({ set: () => ({ where: (...a: any[]) => { updateWhere(...a); return Promise.resolve(); } }) }),
  },
}));

const lead = { id: "lead-1", name: "Ada", email: "ada@x.com", phone: null, company: null, status: "new", sourceId: "src-fb", organizationId: "org-1" };
vi.mock("@/domains/leads/service", () => ({
  LeadService: { getLeadById: vi.fn().mockResolvedValue(lead) },
}));

const sendEmail = vi.fn();
vi.mock("@/lib/mail/mailer", () => ({
  sendEmail: (...args: any[]) => sendEmail(...args),
  appUrl: (p: string) => `https://app.test${p}`,
}));

import { LeadDistributionService } from "./leadDistributionService";

const rule = (over: Partial<any> = {}) => ({ id: "r", sourceId: null, recipients: ["a@x.com"], skipSave: 0, isActive: 1, ...over });

describe("LeadDistributionService.distribute", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    updateWhere.mockReset();
    ruleRows = [];
  });

  it("emails recipients of a matching rule (any-source) with a link back", async () => {
    ruleRows = [rule({ recipients: ["a@x.com", "b@x.com"] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0].html).toContain("https://app.test/leads/lead-1");
  });

  it("matches on source and skips non-matching sources", async () => {
    ruleRows = [rule({ sourceId: "src-fb", recipients: ["match@x.com"] }), rule({ sourceId: "src-other", recipients: ["nope@x.com"] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("match@x.com");
  });

  it("dedupes an address shared across matching rules", async () => {
    ruleRows = [rule({ recipients: ["dup@x.com"] }), rule({ recipients: ["dup@x.com"] })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("soft-deletes the lead when a matching rule sets skipSave", async () => {
    ruleRows = [rule({ recipients: ["a@x.com"], skipSave: 1 })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("no-ops when no rule matches", async () => {
    ruleRows = [rule({ sourceId: "src-other" })];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
