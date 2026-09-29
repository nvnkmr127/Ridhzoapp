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

import { adminPlanValue, effectivePlan } from "./planNames";

describe("plan state after signup", () => {
  const day = 86_400_000;
  const signup = { plan: "starter", planStatus: "active", complimentary: 0, trialEndsAt: new Date(Date.now() + 14 * day) };

  it("a new signup is a Starter trial — not paying, not free-for-client", () => {
    expect(effectivePlan(signup)).toBe("starter");
    expect(isPayingOrg(signup)).toBe(false);
    expect(adminPlanValue(signup)).toBe("starter_trial");
  });

  it("an ended trial is Free and not paying, even before the worker downgrades the row", () => {
    const ended = { ...signup, trialEndsAt: new Date(Date.now() - 60_000) };
    expect(effectivePlan(ended)).toBe("free");
    expect(isPayingOrg(ended)).toBe(false);
    expect(adminPlanValue(ended)).toBe("free");
  });

  it("the admin picker distinguishes paying, payment due and free-for-client", () => {
    expect(adminPlanValue({ plan: "starter", planStatus: "active" })).toBe("starter_paid");
    expect(adminPlanValue({ plan: "unlimited", planStatus: "halted" })).toBe("unlimited_unpaid");
    expect(adminPlanValue({ plan: "starter", planStatus: "active", complimentary: 1 })).toBe("starter");
    expect(adminPlanValue({ plan: "free", planStatus: "active" })).toBe("free");
  });
});
