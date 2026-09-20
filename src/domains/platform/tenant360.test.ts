import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlatformService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/redis", () => ({
  redisConfigured: false,
}));

vi.mock("./revops", () => ({
  RevOpsService: {
    listTenantHealth: vi.fn().mockResolvedValue([
      {
        id: "org_1",
        name: "Sharma Textiles",
        slug: "sharma-textiles",
        plan: "pro",
        leadCount: 42,
        userCount: 3,
        lastActiveAt: "2026-09-08T00:00:00.000Z",
        daysInactive: 12,
        health: "at_risk",
        aiCredits: 150,
        whatsappCredits: 300,
      },
    ]),
  },
}));

vi.mock("@/domains/billing/lifecycleService", () => ({
  BillingLifecycleService: {
    getTenantBillingStatus: vi.fn().mockResolvedValue({
      orgId: "org_1",
      orgName: "Sharma Textiles",
      slug: "sharma-textiles",
      plan: "pro",
      planStatus: "active",
      status: "grace_period",
      gracePeriodEndsAt: "2026-09-25T00:00:00.000Z",
      daysRemainingInGrace: 5,
      lastPaymentFailureAt: "2026-09-18T00:00:00.000Z",
      failureReason: "Card declined by issuing bank",
      dunningSentAt: "2026-09-18T00:00:00.000Z",
      manualPaidUntil: null,
      currentPeriodEnd: "2026-09-18T00:00:00.000Z",
      razorpaySubscriptionId: "sub_123",
    }),
  },
}));

vi.mock("@/domains/billing/invoiceService", () => ({
  InvoiceService: {
    listInvoices: vi.fn().mockResolvedValue([
      {
        id: "inv_1",
        invoiceNumber: "INV-2026-0001",
        orgId: "org_1",
        orgName: "Sharma Textiles",
        plan: "pro",
        amount: 249,
        taxRate: 18,
        taxAmount: 45,
        totalAmount: 294,
        status: "paid",
        issuedAt: "2026-08-18T00:00:00.000Z",
      },
      {
        id: "inv_2",
        invoiceNumber: "INV-2026-0002",
        orgId: "org_2",
        orgName: "Other Corp",
        plan: "business",
        amount: 449,
        taxRate: 18,
        taxAmount: 81,
        totalAmount: 530,
        status: "paid",
        issuedAt: "2026-08-19T00:00:00.000Z",
      },
    ]),
  },
}));

vi.mock("./supportService", () => ({
  SupportTicketService: {
    listTickets: vi.fn().mockResolvedValue([
      {
        id: "ticket_1",
        orgId: "org_1",
        orgName: "Sharma Textiles",
        userId: "user_1",
        userEmail: "owner@sharma.com",
        subject: "Card charge failed",
        category: "billing",
        priority: "urgent",
        status: "open",
        slaDeadline: "2026-09-20T18:00:00.000Z",
        messages: [],
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ]),
  },
}));

vi.mock("./anomalyDetectionService", () => ({
  AnomalyDetectionService: {
    getCachedAnomalies: vi.fn().mockResolvedValue([
      {
        id: "anom_1",
        severity: "medium",
        category: "webhook_flood",
        organizationId: "org_1",
        organizationName: "Sharma Textiles",
        title: "High webhook failure rate",
        description: "25 delivery failures in last 24h",
        detectedAt: "2026-09-19T10:00:00.000Z",
        metric: { name: "webhookFailures", current: 25, threshold: 20 },
        suggestedAction: "inspect_dlq",
        status: "active",
      },
    ]),
  },
}));

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn().mockImplementation((key: string, def: any) => {
      if (key === "seat_overrides") return Promise.resolve({ org_1: 10 });
      return Promise.resolve(def);
    }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("PlatformService.getTenant360", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if organization does not exist", async () => {
    const limitMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    vi.mocked(db.select).mockReturnValue({ from: fromMock } as any);

    const result = await PlatformService.getTenant360("non_existent_org");
    expect(result).toBeNull();
  });

  it("composes complete 360 profile for an organization", async () => {
    const mockOrg = {
      id: "org_1",
      name: "Sharma Textiles",
      slug: "sharma-textiles",
      plan: "pro",
      planStatus: "active",
      suspendedAt: null,
      timezone: "Asia/Kolkata",
      currency: "INR",
      dateFormat: "DD/MM/YYYY",
      industry: "Manufacturing",
      phone: "+919876543210",
      website: "https://sharmatextiles.example.com",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-09-08"),
    };

    // Chainable select mocks for: org lookup, users, lead status breakdown, recent leads, audit logs, dlq, api keys
    vi.mocked(db.select).mockImplementation((() => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.leftJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockImplementation((n?: number) => {
        if (n === 1) return Promise.resolve([mockOrg]);
        return Promise.resolve([]);
      });
      chain.then = (fn: any) => Promise.resolve([]).then(fn);
      chain.catch = (fn: any) => Promise.resolve([]).catch(fn);
      return chain;
    }) as any);

    const res = await PlatformService.getTenant360("org_1");

    expect(res).not.toBeNull();
    expect(res?.org.name).toBe("Sharma Textiles");
    expect(res?.health?.health).toBe("at_risk");
    expect(res?.health?.daysInactive).toBe(12);
    expect(res?.billing?.status).toBe("grace_period");
    expect(res?.billing?.failureReason).toBe("Card declined by issuing bank");
    expect(res?.invoices).toHaveLength(1);
    expect(res?.invoices[0].invoiceNumber).toBe("INV-2026-0001");
    expect(res?.tickets).toHaveLength(1);
    expect(res?.tickets[0].subject).toBe("Card charge failed");
    expect(res?.anomalies).toHaveLength(1);
    expect(res?.customSeats).toBe(10);
    expect(res?.integrations).toBeDefined();
    expect(Array.isArray(res?.integrations.sources)).toBe(true);
    expect(Array.isArray(res?.integrations.endpoints)).toBe(true);
  });

  it("diagnoses dead Facebook Page token (OAuth Code 190) and surfaces dropped events", async () => {
    const mockOrg = {
      id: "org_fb",
      name: "Sharma Textiles",
      slug: "sharma-textiles",
      plan: "pro",
      planStatus: "active",
      suspendedAt: null,
      timezone: "Asia/Kolkata",
      currency: "INR",
      dateFormat: "DD/MM/YYYY",
      industry: "Manufacturing",
      phone: "+919876543210",
      website: "https://sharmatextiles.example.com",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-09-08"),
    };

    const mockLeadSource = {
      id: "src_1",
      name: "Main FB Page",
      type: "facebook_lead_ads",
      isActive: 1,
      config: {
        pageId: "page_12345",
        pageAccessToken: "invalid_token",
        needsReconnect: true,
      },
      createdAt: new Date("2026-02-01"),
    };

    const mockFailedEvent = {
      pageId: "page_12345",
      c: 14,
      lastMessage: "Error validating access token: Session has expired (code 190)",
    };

    vi.mocked(db.select).mockImplementation(((fields: any) => {
      const keys = fields ? Object.keys(fields).join(",") : "none";
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.leftJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockImplementation((n?: number) => {
        if (n === 1) return Promise.resolve([mockOrg]);
        return Promise.resolve([]);
      });
      chain.then = (fn: any) => {
        let res: any[] = [];
        if (keys.includes("config") && keys.includes("type")) {
          res = [mockLeadSource];
        } else if (keys.includes("lastMessage")) {
          res = [mockFailedEvent];
        }
        return Promise.resolve(res).then(fn);
      };
      chain.catch = (fn: any) => chain.then(null, fn);
      return chain;
    }) as any);

    const res = await PlatformService.getTenant360("org_fb");
    expect(res).not.toBeNull();
    expect(res?.integrations.metaTokenDeadCount).toBe(1);
    expect(res?.integrations.sources).toHaveLength(1);
    const src = res?.integrations.sources[0];
    expect(src?.tokenStatus).toBe("dead");
    expect(src?.needsReconnect).toBe(true);
    expect(src?.authFailedEventsCount).toBe(14);
    expect(src?.authErrorMessage).toContain("code 190");
  });
});

