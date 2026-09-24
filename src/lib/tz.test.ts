import { describe, expect, it } from "vitest";
import { dayKey, startOfZonedDay, startOfZonedMonth, zonedTimeToUtc } from "./tz";

describe("tz helpers", () => {
  const now = new Date("2026-10-05T20:00:00Z"); // 01:30 on Oct 6 in Kolkata

  it("computes the local day, not the server's", () => {
    expect(dayKey(now, "Asia/Kolkata")).toBe("2026-10-06");
    expect(dayKey(now, "UTC")).toBe("2026-10-05");
    expect(startOfZonedDay(now, "Asia/Kolkata").toISOString()).toBe("2026-10-05T18:30:00.000Z");
    expect(startOfZonedDay(now, "Asia/Kolkata", -1).toISOString()).toBe("2026-10-04T18:30:00.000Z");
  });

  it("handles month starts and DST", () => {
    expect(startOfZonedMonth(now, "Asia/Kolkata").toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(startOfZonedMonth(new Date("2026-01-15T12:00:00Z"), "Asia/Kolkata", -1).toISOString()).toBe("2025-11-30T18:30:00.000Z");
    // New York: 10 AM on a summer day is 14:00Z, on a winter day 15:00Z.
    expect(zonedTimeToUtc(2026, 7, 1, 10, 0, "America/New_York").toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(zonedTimeToUtc(2026, 12, 1, 10, 0, "America/New_York").toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });
});
