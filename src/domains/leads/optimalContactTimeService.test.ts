import { describe, expect, it, vi } from "vitest";
import { OptimalContactTimeService } from "./optimalContactTimeService";

vi.mock("@/lib/format.server", () => ({ getOrgFormat: vi.fn().mockResolvedValue({ timezone: "UTC" }) }));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([
            { id: "lead-1" },
            { id: "lead-2" },
          ])
        ),
      })),
    })),
  },
}));

describe("OptimalContactTimeService", () => {
  it("should calculate optimal outreach hour and day based on activity timestamps", async () => {
    const { db } = await import("@/db");
    // Tuesday at 14:30 PM
    const tuesdayTwoPm = new Date("2026-08-25T14:30:00.000Z"); // Tuesday

    // Mock Activities joined with leads
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () =>
            Promise.resolve([
              { at: tuesdayTwoPm },
              { at: tuesdayTwoPm },
              { at: tuesdayTwoPm },
            ]),
        }),
      }),
    }));

    const metrics = await OptimalContactTimeService.getOptimalContactTimes("org-1");

    expect(metrics.totalTouchpointsAnalyzed).toBe(3);
    expect(metrics.bestDayOfWeek).toBe("Tuesday");
    expect(metrics.bestHourOfDayLabel).toContain("PM");
    expect(metrics.hourlyDistribution.length).toBe(24);
    expect(metrics.dailyDistribution.length).toBe(7);
  });
});
