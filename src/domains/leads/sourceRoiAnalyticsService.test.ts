import { describe, expect, it, vi } from "vitest";
import { SourceRoiAnalyticsService } from "./sourceRoiAnalyticsService";

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
            { id: "src-fb", name: "Facebook Ads", type: "facebook" },
            { id: "src-web", name: "Website Form", type: "web_form" },
          ])
        ),
      })),
    })),
  },
}));

describe("SourceRoiAnalyticsService", () => {
  it("should calculate source win rates and deal value ROI", async () => {
    const { db } = await import("@/db");
    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { id: "src-fb", name: "Facebook Ads", type: "facebook" },
          ]),
      }),
    }));

    (db.select as any).mockImplementationOnce(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { sourceId: "src-fb", status: "won", expectedValue: "5000" },
            { sourceId: "src-fb", status: "active", expectedValue: "3000" },
            { sourceId: null, status: "won", expectedValue: "2000" },
          ]),
      }),
    }));

    const metrics = await SourceRoiAnalyticsService.getLeadSourceRoiMetrics("org-1");

    expect(metrics.length).toBe(2);
    const fbMetric = metrics.find((m) => m.sourceId === "src-fb");
    expect(fbMetric?.totalLeads).toBe(2);
    expect(fbMetric?.wonLeads).toBe(1);
    expect(fbMetric?.winRatePercentage).toBe(50);
    expect(fbMetric?.totalRevenue).toBe(5000);
  });
});
