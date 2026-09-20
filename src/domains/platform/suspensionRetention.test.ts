import { describe, it, expect, vi, beforeEach } from "vitest";
import { ComplianceService } from "./complianceService";
import { db } from "@/db";
import { PlatformConfigService } from "./configService";
import { sendEmail } from "@/lib/mail/mailer";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
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

vi.mock("./opsAlertService", () => ({
  OpsAlertService: {
    dispatchAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ComplianceService - Suspension Retention Policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips orgs that are not within the warning or retention window", async () => {
    const recentDate = new Date("2026-09-01T00:00:00Z");
    const currentDate = new Date("2026-09-20T00:00:00Z"); // 19 days suspended

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: "org_1", name: "Recent Suspend", slug: "recent-suspend", suspendedAt: recentDate },
        ]),
      }),
    } as any);

    vi.mocked(PlatformConfigService.get).mockResolvedValue({});

    const res = await ComplianceService.processSuspensionRetention(currentDate);
    expect(res.scannedCount).toBe(1);
    expect(res.warnedCount).toBe(0);
    expect(res.anonymizedCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends warning email to owner when suspended >= 166 days but < 180 days", async () => {
    const suspendedDate = new Date("2026-01-01T00:00:00Z");
    const currentDate = new Date("2026-06-20T00:00:00Z"); // ~170 days suspended

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (selectCallCount === 1) {
              return Promise.resolve([
                { id: "org_warn", name: "Warn Org", slug: "warn-org", suspendedAt: suspendedDate },
              ]);
            }
            // owner query
            return {
              limit: vi.fn().mockResolvedValue([{ email: "owner@warn.com", firstName: "Alice" }]),
            };
          }),
        }),
      } as any;
    });

    vi.mocked(PlatformConfigService.get).mockResolvedValue({});

    const res = await ComplianceService.processSuspensionRetention(currentDate);
    expect(res.warnedCount).toBe(1);
    expect(res.anonymizedCount).toBe(0);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@warn.com",
        subject: expect.stringContaining("Data retention expiry for Warn Org"),
      })
    );
    expect(PlatformConfigService.set).toHaveBeenCalledWith(
      "retention_state:org_warn",
      expect.objectContaining({ warnedAt: expect.any(String) })
    );
  });

  it("anonymizes tenant records when suspended >= 180 days", async () => {
    const suspendedDate = new Date("2026-01-01T00:00:00Z");
    const currentDate = new Date("2026-07-15T00:00:00Z"); // 195 days suspended

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (selectCallCount === 1) {
              return Promise.resolve([
                { id: "org_expired", name: "Expired Org", slug: "expired-org", suspendedAt: suspendedDate },
              ]);
            }
            if (selectCallCount === 2) {
              // select org in anonymizeTenant
              return {
                limit: vi.fn().mockResolvedValue([
                  { id: "org_expired", name: "Expired Org", slug: "expired-org" },
                ]),
              };
            }
            // select leads in anonymizeTenant
            return Promise.resolve([{ id: "lead_1" }, { id: "lead_2" }]);
          }),
        }),
      } as any;
    });

    const mockUpdate = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };
    vi.mocked(db.update).mockReturnValue(mockUpdate as any);

    vi.mocked(PlatformConfigService.get).mockResolvedValue({});

    const res = await ComplianceService.processSuspensionRetention(currentDate);
    expect(res.anonymizedCount).toBe(1);
    expect(db.update).toHaveBeenCalled();
    expect(PlatformConfigService.set).toHaveBeenCalledWith(
      "retention_state:org_expired",
      expect.objectContaining({ anonymizedAt: expect.any(String) })
    );
  });
});
