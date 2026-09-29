import { describe, it, expect } from "vitest";
import { periodChange } from "./change";

describe("periodChange", () => {
  it("relative change for counts, coloured by direction", () => {
    expect(periodChange(120, 100, "pct")).toEqual({ text: "▲ 20% vs previous period", good: true });
    expect(periodChange(80, 100, "pct")).toEqual({ text: "▼ 20% vs previous period", good: false });
  });
  it("percentage points for rates", () => {
    expect(periodChange(42.5, 40, "pts")?.text).toBe("▲ 2.5 pts vs previous period");
  });
  it("lower-is-better metrics flip the colour", () => {
    expect(periodChange(5, 10, "pct", true)?.good).toBe(true);
  });
  it("from zero, and nothing to compare", () => {
    expect(periodChange(3, 0, "pct")?.text).toBe("▲ new vs previous period");
    expect(periodChange(0, 0, "pct")).toEqual({ text: "no change vs previous period", good: null });
    expect(periodChange(3, null, "pct")).toBeNull();
  });
});
