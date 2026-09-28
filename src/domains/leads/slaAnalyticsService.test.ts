import { describe, expect, it, vi } from "vitest";
import { SlaAnalyticsService } from "./slaAnalyticsService";

const rows = [
          {
            id: "lead-1",
            createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 mins ago
            lastContactedAt: new Date(Date.now() - 20 * 60 * 1000), // contacted 10 mins after creation -> SLA Compliant (<= 15)
            status: "active",
          },
          {
            id: "lead-2",
            createdAt: new Date(Date.now() - 60 * 60 * 1000), // 60 mins ago
            lastContactedAt: new Date(Date.now() - 20 * 60 * 1000), // contacted 40 mins after creation -> SLA Breached (> 15)
            status: "active",
          },
          {
            id: "lead-3",
            createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 mins ago
            lastContactedAt: null, // uncontacted -> SLA Breached
            status: "new",
          },
        ];

// The SQL path returns Postgres' aggregate row; the preloaded path runs the same rules in JS.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ total: 3, contacted: 2, compliant: 1, breached: 2, avg: 25 }]),
      })),
    })),
  },
}));

describe("SlaAnalyticsService", () => {
  it("should calculate SLA compliance metrics correctly", async () => {
    const metrics = await SlaAnalyticsService.getSlaMetrics("org-1", 15, rows);

    expect(metrics.totalLeads).toBe(3);
    expect(metrics.contactedLeads).toBe(2);
    expect(metrics.uncontactedLeads).toBe(1);
    expect(metrics.slaCompliantCount).toBe(1);
    expect(metrics.slaBreachedCount).toBe(2);
    expect(metrics.avgFirstContactMinutes).toBe(25); // (10 + 40) / 2
  });

  it("maps the SQL aggregate to the same shape (dashboard path)", async () => {
    const metrics = await SlaAnalyticsService.getSlaMetrics("org-1", 15);
    expect(metrics).toEqual({
      totalLeads: 3,
      contactedLeads: 2,
      uncontactedLeads: 1,
      slaBreachedCount: 2,
      slaCompliantCount: 1,
      complianceRatePercentage: 33.3,
      avgFirstContactMinutes: 25,
    });
  });

  it("measures response time to the FIRST contact, not the latest follow-up", async () => {
    const created = new Date("2026-01-01T10:00:00Z");
    const metrics = await SlaAnalyticsService.getSlaMetrics("org-1", 15, [
      {
        id: "a",
        createdAt: created,
        firstContactedAt: new Date("2026-01-01T10:05:00Z"), // answered in 5 min
        lastContactedAt: new Date("2026-01-11T10:00:00Z"), // followed up 10 days later
        status: "active",
      },
    ]);
    expect(metrics.avgFirstContactMinutes).toBe(5);
    expect(metrics.slaCompliantCount).toBe(1);
    expect(metrics.slaBreachedCount).toBe(0);
  });
});
