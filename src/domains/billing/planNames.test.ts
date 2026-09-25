import { describe, expect, it } from "vitest";
import { canonicalPlan, isPaidPlan } from "./planNames";

describe("plan names", () => {
  it("maps old names and unknowns", () => {
    expect(canonicalPlan("pro")).toBe("starter");
    expect(canonicalPlan("business")).toBe("unlimited");
    expect(canonicalPlan("Starter")).toBe("starter");
    expect(canonicalPlan(null)).toBe("free");
    expect(canonicalPlan("weird")).toBe("free");
  });
  it("knows who pays", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("unlimited")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
  });
});
