// Plan names in one place. "pro"/"business" are the old names for Starter/Unlimited; migration 0067
// renamed stored values, and everything still reads through canonicalPlan() so a stray old value
// (an old broadcast, feature flag or API payload) keeps working. Dependency-free: safe for client code.

export type PlanName = "free" | "starter" | "unlimited";

export const PLAN_NAMES: PlanName[] = ["free", "starter", "unlimited"];

export const PLAN_LABELS: Record<PlanName, string> = { free: "Free", starter: "Starter", unlimited: "Unlimited" };

// List price per month in ₹, for MRR reporting.
export const PLAN_MONTHLY_PRICE: Record<PlanName, number> = { free: 0, starter: 249, unlimited: 449 };

const LEGACY: Record<string, PlanName> = { pro: "starter", business: "unlimited" };

export function canonicalPlan(plan: string | null | undefined): PlanName {
  const p = (plan ?? "free").toLowerCase();
  if (p in LEGACY) return LEGACY[p];
  return (PLAN_NAMES as string[]).includes(p) ? (p as PlanName) : "free";
}

export const isPaidPlan = (plan: string | null | undefined) => canonicalPlan(plan) !== "free";
