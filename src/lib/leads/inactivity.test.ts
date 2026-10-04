import { describe, it, expect } from "vitest";
import { DAY_MS, GOING_COLD_DAYS, REENGAGE_AFTER_DAYS, STALE_AFTER_DAYS, daysSince, inactivityTier } from "./inactivity";

describe("daysSince", () => {
  const now = new Date("2026-10-03T09:00:00Z");

  it("measures whole days back from a date", () => {
    expect(daysSince(new Date("2026-10-01T09:00:00Z"), now)).toBeCloseTo(2, 5);
    expect(daysSince("2026-10-02T09:00:00Z", now)).toBeCloseTo(1, 5);
  });

  it("treats a missing or unparseable date as never contacted", () => {
    expect(daysSince(null, now)).toBe(Infinity);
    expect(daysSince(undefined, now)).toBe(Infinity);
    expect(daysSince("not a date", now)).toBe(Infinity);
  });

  it("is negative rather than NaN for a date in the future", () => {
    expect(daysSince(new Date(now.getTime() + 2 * DAY_MS), now)).toBeCloseTo(-2, 5);
  });
});

describe("inactivityTier", () => {
  it("maps the ladder onto one word, so the same lead isn't described two ways", () => {
    expect(inactivityTier(0)).toBe("active");
    expect(inactivityTier(GOING_COLD_DAYS - 1)).toBe("active");
    expect(inactivityTier(GOING_COLD_DAYS)).toBe("cooling");
    expect(inactivityTier(STALE_AFTER_DAYS - 1)).toBe("cooling");
    expect(inactivityTier(STALE_AFTER_DAYS)).toBe("stale");
    expect(inactivityTier(90)).toBe("stale");
  });

  it("has rungs in order, so a later tier can never come before an earlier one", () => {
    expect(GOING_COLD_DAYS).toBeLessThan(STALE_AFTER_DAYS);
    // Re-engagement and reclamation share a day today, so there is no gap tier between them.
    expect(REENGAGE_AFTER_DAYS).toBe(STALE_AFTER_DAYS);
  });
});