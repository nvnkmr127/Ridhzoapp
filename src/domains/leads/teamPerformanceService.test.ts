import { describe, expect, it, vi } from "vitest";
import { TeamPerformanceService } from "./teamPerformanceService";

// Reports resolve custom statuses by category; these tests use the built-in five (no DB round trip).
vi.mock("./customStatusSchemaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./customStatusSchemaService")>();
  const base = new Map(actual.DEFAULT_SYSTEM_STATUSES.map((s) => [s.key, s.category]));
  const keys = (...c: string[]) => [...base].filter(([, v]) => c.includes(v)).map(([k]) => k);
  return {
    ...actual,
    CustomStatusSchemaService: Object.assign(actual.CustomStatusSchemaService, {
      resolver: async () => ({ cat: (s: string | null | undefined) => base.get(s ?? "") ?? "open", openKeys: keys("open", "in_progress"), closedKeys: keys("won", "lost", "unqualified") }),
    }),
  };
});


vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([
            { id: "user-1", email: "rep1@example.com", firstName: "Alice", lastName: "Smith" },
            { id: "user-2", email: "rep2@example.com", firstName: "Bob", lastName: "Jones" },
          ])
        ),
      })),
    })),
  },
}));

describe("TeamPerformanceService", () => {
  it("should calculate rep leaderboard metrics and rankings correctly", async () => {
    const { db } = await import("@/db");
    // Mock Users
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { id: "user-1", email: "rep1@example.com", firstName: "Alice", lastName: "Smith" },
            { id: "user-2", email: "rep2@example.com", firstName: "Bob", lastName: "Jones" },
          ]),
      }),
    }));

    // Mock Leads
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { id: "lead-1", ownerId: "user-1", status: "won", expectedValue: "10000" },
            { id: "lead-2", ownerId: "user-1", status: "active", expectedValue: "5000" },
            { id: "lead-3", ownerId: "user-2", status: "won", expectedValue: "25000" },
          ]),
      }),
    }));

    // Mock FollowUps
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          groupBy: () =>
            Promise.resolve([
              { userId: "user-1", count: 12 },
              { userId: "user-2", count: 8 },
            ]),
        }),
      }),
    }));

    const leaderboard = await TeamPerformanceService.getTeamLeaderboard("org-1");

    expect(leaderboard.length).toBe(2);
    // Bob should be Rank 1 due to higher revenue ($25,000)
    expect(leaderboard[0].userId).toBe("user-2");
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].totalRevenue).toBe(25000);

    // Alice should be Rank 2 ($10,000 revenue)
    expect(leaderboard[1].userId).toBe("user-1");
    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[1].totalAssignedLeads).toBe(2);
    expect(leaderboard[1].winRatePercentage).toBe(50);
  });
});
