import { describe, expect, it, vi } from "vitest";

// A workspace with custom statuses: "closed_paid" is a WON status, "site_visit_booked" in progress.
vi.mock("./customStatusSchemaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./customStatusSchemaService")>();
  const map = new Map<string, string>([["fresh", "open"], ["site_visit_booked", "in_progress"], ["closed_paid", "won"], ["not_interested", "lost"]]);
  return {
    ...actual,
    CustomStatusSchemaService: Object.assign(actual.CustomStatusSchemaService, {
      resolver: async () => ({ cat: (s: string | null | undefined) => map.get(s ?? "") ?? "open", openKeys: ["fresh", "site_visit_booked"], closedKeys: ["closed_paid", "not_interested"] }),
    }),
  };
});
vi.mock("@/db", () => ({ db: {} }));

import { WinLossAnalyticsService } from "./winLossAnalyticsService";
import { RevenueForecastService } from "./revenueForecastService";

describe("reports with custom statuses", () => {
  it("counts a custom won status as a win", async () => {
    const r = await WinLossAnalyticsService.getWinLossAnalytics("org", [
      { id: "1", status: "closed_paid", lostReason: null },
      { id: "2", status: "not_interested", lostReason: "Budget" },
    ]);
    expect(r).toMatchObject({ wonCount: 1, lostCount: 1 });
  });

  it("puts custom won revenue into closed revenue", async () => {
    const r = await RevenueForecastService.getRevenueForecast("org", [
      { id: "1", status: "closed_paid", expectedValue: "5000" },
      { id: "2", status: "site_visit_booked", expectedValue: "1000" },
    ]);
    expect(JSON.stringify(r)).toContain("5000");
  });
});
