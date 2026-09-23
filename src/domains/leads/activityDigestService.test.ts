import { describe, expect, it, vi } from "vitest";
import { ActivityDigestService } from "./activityDigestService";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([
            { id: "user-1", email: "rep1@example.com", firstName: "Alice", lastName: "Smith" },
          ])
        ),
      })),
    })),
  },
}));

describe("ActivityDigestService", () => {
  it("should calculate daily activity digest and rep summaries", async () => {
    const { db } = await import("@/db");
    // Mock Users
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "user-1", email: "rep1@example.com", firstName: "Alice", lastName: "Smith" }]),
      }),
    }));
    // Mock Activity counts joined with leads
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: () =>
              Promise.resolve([
                { userId: "user-1", type: "note", count: 5 },
                { userId: "user-1", type: "call", count: 3 },
              ]),
          }),
        }),
      }),
    }));

    const digest = await ActivityDigestService.getDailyActivityDigest("org-1", "2026-08-28");

    expect(digest.date).toBe("2026-08-28");
    expect(digest.totalActivities).toBe(8);
    expect(digest.typeBreakdown["note"]).toBe(5);
    expect(digest.typeBreakdown["call"]).toBe(3);

    expect(digest.repSummaries.length).toBe(1);
    expect(digest.repSummaries[0].userName).toBe("Alice Smith");
    expect(digest.repSummaries[0].totalActivities).toBe(8);
  });
});
