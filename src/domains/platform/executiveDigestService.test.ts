import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutiveDigestService } from "./executiveDigestService";
import { PlatformConfigService } from "./configService";
import { PlatformService } from "./service";
import { RevOpsService } from "./revops";
import { SupportTicketService } from "./supportService";
import { sendEmail } from "@/lib/mail/mailer";

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("./service", () => ({
  PlatformService: {
    getPlatformMetrics: vi.fn(),
  },
}));

vi.mock("./revops", () => ({
  RevOpsService: {
    getMetrics: vi.fn(),
    listTenantHealth: vi.fn(),
  },
}));

vi.mock("./supportService", () => ({
  SupportTicketService: {
    listTickets: vi.fn(),
  },
}));

vi.mock("@/lib/mail/mailer", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ email: "super@ridhzo.com" }]),
      }),
    }),
  },
}));

describe("ExecutiveDigestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds digest data and renders HTML containing ARR and health metrics", async () => {
    vi.mocked(PlatformConfigService.get).mockResolvedValue({
      enabled: true,
      frequency: "weekly",
      recipients: ["ceo@ridhzo.com"],
      lastSentAt: null,
    } as any);

    vi.mocked(PlatformService.getPlatformMetrics).mockResolvedValue({
      totalOrgs: 25,
      totalUsers: 84,
      totalLeads: 5200,
      activeEscalations: 2,
      failedDeliveries: 3,
      dbHealthy: true,
      redisConfigured: true,
    } as any);

    vi.mocked(RevOpsService.getMetrics).mockResolvedValue({
      mrr: 12500,
      arr: 150000,
      arpu: 250,
      paidAccounts: 20,
      freeAccounts: 5,
      churnRiskCount: 1,
    } as any);

    vi.mocked(SupportTicketService.listTickets).mockResolvedValue([
      { status: "open" },
      { status: "resolved" },
    ] as any);

    vi.mocked(RevOpsService.listTenantHealth).mockResolvedValue([
      {
        id: "org_1",
        name: "Acme Corp",
        plan: "pro",
        daysInactive: 15,
        health: "critical",
      },
    ] as any);

    const data = await ExecutiveDigestService.buildDigestData();
    expect(data.metrics.totalOrgs).toBe(25);
    expect(data.revops.arr).toBe(150000);
    expect(data.openTicketsCount).toBe(1);
    expect(data.atRiskTenants.length).toBe(1);

    const html = ExecutiveDigestService.renderDigestHtml(data);
    expect(html).toContain("150,000");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("critical");
  });

  it("dispatches digest emails to configured recipients", async () => {
    vi.mocked(PlatformConfigService.get).mockResolvedValue({
      enabled: true,
      frequency: "weekly",
      recipients: ["leadership@ridhzo.com"],
      lastSentAt: null,
    } as any);

    vi.mocked(PlatformService.getPlatformMetrics).mockResolvedValue({
      totalOrgs: 10,
      totalUsers: 20,
      totalLeads: 100,
      activeEscalations: 0,
      failedDeliveries: 0,
      dbHealthy: true,
      redisConfigured: false,
    } as any);

    vi.mocked(RevOpsService.getMetrics).mockResolvedValue({
      mrr: 500,
      arr: 6000,
      arpu: 250,
      paidAccounts: 2,
      freeAccounts: 8,
      churnRiskCount: 0,
    } as any);

    vi.mocked(SupportTicketService.listTickets).mockResolvedValue([]);
    vi.mocked(RevOpsService.listTenantHealth).mockResolvedValue([]);

    const res = await ExecutiveDigestService.sendDigest();
    expect(res.count).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "leadership@ridhzo.com",
        subject: expect.stringContaining("Executive"),
      })
    );
  });
});
