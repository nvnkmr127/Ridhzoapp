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

type PlanOrg = { plan: string | null; planStatus?: string | null; complimentary?: number | null; trialEndsAt?: Date | string | null };

// Payment clears trialEndsAt, so a set one always means "on a trial". Once it has passed the org is
// Free — immediately, not only after the hourly trial-downgrade worker rewrites the row (a late or
// stopped worker used to leave expired trials on Starter and counted as paying).
export const trialExpired = (org: Pick<PlanOrg, "trialEndsAt">, now = Date.now()) =>
  !!org.trialEndsAt && new Date(org.trialEndsAt).getTime() <= now;

export const effectivePlan = (org: PlanOrg, now = Date.now()): PlanName => (trialExpired(org, now) ? "free" : canonicalPlan(org.plan));

// Actually paying (counts as revenue): a paid plan, active, not given free by an admin, not on a trial.
export function isPayingOrg(org: PlanOrg): boolean {
  if (!isPaidPlan(org.plan) || org.planStatus !== "active" || org.complimentary === 1) return false;
  return !org.trialEndsAt;
}

// Admin plan pickers: which option shows as current. "<plan>" alone means "free for client" (a
// complimentary grant) — only complimentary orgs may show it, or every trial looks like a freebie.
export function adminPlanValue(org: PlanOrg, now = Date.now()): string {
  const plan = effectivePlan(org, now);
  if (plan === "free") return "free";
  if (org.complimentary === 1) return plan;
  if (org.trialEndsAt) return `${plan}_trial`;
  return org.planStatus === "active" ? `${plan}_paid` : `${plan}_unpaid`;
}
