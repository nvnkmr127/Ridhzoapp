import { describe, expect, it, vi } from "vitest";
import { StaleLeadReclamationService } from "./staleLeadReclamationService";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => {
          const rows = [
            {
              id: "lead-stale-1",
              name: "Old Lead",
              status: "active",
              phone: "1234567",
              email: "old@example.com",
              lastContactedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
              createdAt: new Date("2026-07-01"),
            },
          ];
          // Awaitable (status-category lookup) and orderable (stale query; no page = every row).
          return Object.assign(Promise.resolve(rows), { orderBy: () => Promise.resolve(rows) });
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    })),
  },
}));

vi.mock("@/domains/activities/service", () => ({
  ActivityService: {
    addActivity: vi.fn().mockResolvedValue({ id: "act-reclaim" }),
  },
}));

describe("StaleLeadReclamationService", () => {
  it("should detect stale leads exceeding inactivity threshold", async () => {
    const stale = await StaleLeadReclamationService.detectStaleLeads("org-1", 14);

    expect(stale.length).toBe(1);
    expect(stale[0].id).toBe("lead-stale-1");
    expect(stale[0].daysInactive).toBe(20);
  });

  it("should escalate priority and reclaim stale leads", async () => {
    const result = await StaleLeadReclamationService.reclaimStaleLeads("org-1", 14, "user-1");

    expect(result.reclaimedCount).toBe(1);
    expect(result.leadIds).toEqual(["lead-stale-1"]);
  });
});
