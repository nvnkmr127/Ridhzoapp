import { describe, it, expect, vi, beforeEach } from "vitest";

// db.select().from().where() resolves to whatever we queue up.
let recipientRows: any[] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(recipientRows) }) }),
  },
}));

const lead = { id: "lead-1", name: "Ada", email: "ada@x.com", phone: null, company: null, status: "new", organizationId: "org-1" };
vi.mock("@/domains/leads/service", () => ({
  LeadService: { getLeadById: vi.fn().mockResolvedValue(lead) },
}));

const sendEmail = vi.fn();
vi.mock("@/lib/mail/mailer", () => ({
  sendEmail: (...args: any[]) => sendEmail(...args),
  appUrl: (p: string) => `https://app.test${p}`,
}));

import { LeadDistributionService } from "./leadDistributionService";

describe("LeadDistributionService.distribute", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    recipientRows = [];
  });

  it("emails every active recipient with a link back to the lead", async () => {
    recipientRows = [
      { id: "r1", channel: "email", destination: "a@x.com", isActive: 1 },
      { id: "r2", channel: "email", destination: "b@x.com", isActive: 1 },
    ];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [mail, orgId] = sendEmail.mock.calls[0];
    expect(mail.to).toBe("a@x.com");
    expect(mail.html).toContain("https://app.test/leads/lead-1");
    expect(orgId).toBe("org-1");
  });

  it("no-ops when there are no recipients", async () => {
    recipientRows = [];
    await LeadDistributionService.distribute("lead-1");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("isolates a failing recipient so the rest still send", async () => {
    recipientRows = [
      { id: "r1", channel: "email", destination: "bad@x.com", isActive: 1 },
      { id: "r2", channel: "email", destination: "good@x.com", isActive: 1 },
    ];
    sendEmail.mockRejectedValueOnce(new Error("bounce"));
    await expect(LeadDistributionService.distribute("lead-1")).resolves.toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
