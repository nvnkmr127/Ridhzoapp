import { describe, expect, it } from "vitest";
import { bestContactWindow } from "./bestContactTime";

// 2026-10-05 is a Monday.
const at = (iso: string) => new Date(iso);

describe("bestContactWindow", () => {
  it("picks the busiest part of the day in the workspace timezone", () => {
    // 13:00Z / 14:00Z = 6:30 / 7:30 PM in Kolkata → evenings, both on weekdays
    const w = bestContactWindow([at("2026-10-05T13:00:00Z"), at("2026-10-06T14:00:00Z"), at("2026-10-07T04:00:00Z")], "Asia/Kolkata");
    expect(w).toMatchObject({ label: "Evenings (5–9 PM)", count: 2, total: 3, days: "weekdays" });
  });

  it("needs two signals in one window", () => {
    expect(bestContactWindow([at("2026-10-05T13:00:00Z")], "Asia/Kolkata")).toBeNull();
    expect(bestContactWindow([at("2026-10-05T04:00:00Z"), at("2026-10-05T13:00:00Z")], "Asia/Kolkata")).toBeNull();
  });
});
