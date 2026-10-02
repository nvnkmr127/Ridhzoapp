import { describe, it, expect } from "vitest";
import { creditPeriodKey } from "./planService";

const at = (iso: string) => new Date(iso);

describe("creditPeriodKey (AI credits follow the billing cycle)", () => {
  it("falls back to the calendar month with no billing date", () => {
    expect(creditPeriodKey(null, at("2026-10-15T10:00:00Z"))).toBe("2026-10");
  });
  it("renews on the subscription's own day, not the 1st", () => {
    const end = at("2026-11-20T00:00:00Z"); // billing day = 20th
    expect(creditPeriodKey(end, at("2026-10-25T00:00:00Z"))).toBe("261020");
    expect(creditPeriodKey(end, at("2026-11-05T00:00:00Z"))).toBe("261020"); // still the cycle that began 20 Oct
    expect(creditPeriodKey(end, at("2026-11-21T00:00:00Z"))).toBe("261120"); // new cycle → counter resets
  });
  it("clamps a 31st billing day in short months and crosses year ends", () => {
    const end = at("2026-12-31T00:00:00Z");
    expect(creditPeriodKey(end, at("2027-02-28T12:00:00Z"))).toBe("270228");
    expect(creditPeriodKey(end, at("2027-01-05T00:00:00Z"))).toBe("261231");
  });
  it("never collides with a calendar key", () => {
    expect(creditPeriodKey(at("2026-11-20T00:00:00Z"), at("2026-11-21T00:00:00Z"))).not.toMatch(/-/);
  });
});
