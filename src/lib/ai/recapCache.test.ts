import { describe, it, expect } from "vitest";
import { RECAP_TTL_MS, recapIsStale } from "./recapCache";

describe("recapCache", () => {
  const now = Date.parse("2026-10-04T12:00:00.000Z");

  it("treats a recap saved inside the TTL as fresh", () => {
    expect(recapIsStale(new Date(now - RECAP_TTL_MS + 60_000).toISOString(), now)).toBe(false);
  });

  it("treats a recap at exactly the TTL as stale — the boundary belongs to the old advice", () => {
    expect(recapIsStale(new Date(now - RECAP_TTL_MS).toISOString(), now)).toBe(true);
  });

  it("treats a missing recap as stale rather than throwing", () => {
    expect(recapIsStale(null, now)).toBe(true);
    expect(recapIsStale(undefined, now)).toBe(true);
  });

  // A malformed `at` from an older cache shape must fail closed: showing untrustworthy advice as
  // current is worse than regenerating a recap that was already paid for.
  it("treats an unparseable timestamp as stale", () => {
    expect(recapIsStale("not-a-date", now)).toBe(true);
  });
});