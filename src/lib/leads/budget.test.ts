import { describe, expect, it } from "vitest";
import { formatInr, parseBudget } from "./budget";

describe("parseBudget", () => {
  it("reads Indian ad-form budget answers", () => {
    expect(parseBudget("₹40–75_lakhs_")).toBe(5_750_000);
    expect(parseBudget("₹25–40_lakhs")).toBe(3_250_000);
    expect(parseBudget("₹75_lakhs–1.5_cr")).toBe(11_250_000);
    expect(parseBudget("above_₹1.5_cr_")).toBe(15_000_000);
    expect(parseBudget("35 Lakhs")).toBe(3_500_000);
    expect(parseBudget("1.7 CR")).toBe(17_000_000);
    expect(parseBudget("50,000")).toBe(50_000);
    expect(parseBudget("not_decided_yet")).toBeNull();
    expect(parseBudget("")).toBeNull();
  });
});

describe("formatInr", () => {
  it("formats in lakhs and crores", () => {
    expect(formatInr(5_750_000)).toBe("₹57.5 L");
    expect(formatInr("15000000.00")).toBe("₹1.5 Cr");
    expect(formatInr(50_000)).toBe("₹50,000");
    expect(formatInr(null)).toBeNull();
  });
});
