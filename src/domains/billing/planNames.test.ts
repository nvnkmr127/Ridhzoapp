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

import { isPayingOrg } from "./planNames";

describe("isPayingOrg", () => {
  const future = new Date(Date.now() + 86_400_000);
  it("excludes free-for-clients, trials and inactive", () => {
    expect(isPayingOrg({ plan: "starter", planStatus: "active" })).toBe(true);
    expect(isPayingOrg({ plan: "starter", planStatus: "active", complimentary: 1 })).toBe(false);
    expect(isPayingOrg({ plan: "starter", planStatus: "active", trialEndsAt: future })).toBe(false);
    expect(isPayingOrg({ plan: "starter", planStatus: "halted" })).toBe(false);
    expect(isPayingOrg({ plan: "free", planStatus: "active" })).toBe(false);
  });
});
