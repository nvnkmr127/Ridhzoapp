import { db } from "@/db";
import { users, leads, invitations, organizations, automations, sequences, leadSources } from "@/db/schema";
import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";
import { canonicalPlan } from "./planNames";

// Per-plan ceilings. Infinity = unlimited. Enforcement lives here; charging (Stripe) is separate
// and needs external keys — the plan column is set by that flow, which isn't wired yet.
// aiCredits = AI generations per calendar month (draft, recap, assistant turn, sequence, improve).
// aiAutoTag = background AI tagging of inbound replies (paid only — it would silently burn credits).
// branding = "Powered by Ridhzo" on hosted web forms.
export type PlanLimits = {
  seats: number; leads: number; automations: number; sequences: number; sources: number;
  aiCredits: number; aiAutoTag: boolean; branding: boolean;
  /** yearlyPrice must match the RAZORPAY_PLAN_*_YEARLY plan amount (2 months free = 10× monthly). */
  price: string; yearlyPrice: string | null; description: string;
};
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { seats: 1, leads: 300, automations: 2, sequences: 1, sources: 1, aiCredits: 15, aiAutoTag: false, branding: true, price: "₹0", yearlyPrice: null, description: "For individuals getting started" },
  starter: { seats: 3, leads: 5_000, automations: 15, sequences: 10, sources: 5, aiCredits: 300, aiAutoTag: true, branding: false, price: "₹249 / mo", yearlyPrice: "₹2,490 / yr", description: "For solo agents & growing teams" },
  unlimited: { seats: Infinity, leads: Infinity, automations: Infinity, sequences: Infinity, sources: Infinity, aiCredits: 2_000, aiAutoTag: true, branding: false, price: "₹449 / mo", yearlyPrice: "₹4,490 / yr", description: "Unlimited leads, seats & full access" },
};

// New workspaces start on a Starter trial; the trial-downgrade worker reverts them to Free after.
export const SIGNUP_TRIAL_DAYS = 14;
export function signupTrial() {
  return { plan: "starter", trialEndsAt: new Date(Date.now() + SIGNUP_TRIAL_DAYS * 86_400_000) };
}

const currentPeriod = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM' (UTC)

// Countable per-org resources capped by plan. Counts every row (active or paused) so pausing
// one can't be used to create more.
const COUNTED = {
  automations: { table: automations, org: automations.organizationId, id: automations.id, createdAt: automations.createdAt, label: "automations" },
  sequences: { table: sequences, org: sequences.organizationId, id: sequences.id, createdAt: sequences.createdAt, label: "sequences" },
  sources: { table: leadSources, org: leadSources.organizationId, label: "lead sources" },
} as const;
export type CountedResource = keyof typeof COUNTED;

export function limitsFor(plan: string) {
  return PLAN_LIMITS[canonicalPlan(plan)];
}

export class PlanService {
  static async plan(organizationId: string) {
    try {
      const res = await db
        .select({ plan: organizations.plan, planStatus: organizations.planStatus })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      const org = Array.isArray(res) ? res[0] : res;
      if (!org) return "free";
      if (org.planStatus && org.planStatus !== "active") {
        const { BillingLifecycleService } = await import("./lifecycleService");
        const lifecycle = await BillingLifecycleService.getLifecycle(organizationId);
        const { status } = BillingLifecycleService.computeStatus(org, lifecycle);
        if (status === "locked" || status === "free") return "free";
        return org.plan ?? "free";
      }
      return org.plan ?? "free";
    } catch {
      return "free";
    }
  }

  // Computes real-time usage against plan limits.
  static async getUsageStats(organizationId: string, knownPlan?: string) {
    let customSeats: number | undefined;
    try {
      const overrides = await PlatformConfigService.get<Record<string, number>>("seat_overrides", {});
      customSeats = overrides?.[organizationId];
    } catch {
      // ignore
    }

    const planName = knownPlan ?? (await this.plan(organizationId));
    const { seats: defaultSeats, leads: maxLeads } = limitsFor(planName);
    const maxSeats = customSeats != null ? customSeats : defaultSeats;

    let userCount = 0;
    let inviteCount = 0;
    let leadCount = 0;

    try {
      const resU = await db.select({ n: count() }).from(users).where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)));
      const resI = await db.select({ n: count() }).from(invitations).where(and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
      const resL = await db.select({ n: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));
      
      const u = Array.isArray(resU) ? resU[0] : resU;
      const i = Array.isArray(resI) ? resI[0] : resI;
      const l = Array.isArray(resL) ? resL[0] : resL;

      userCount = u?.n != null ? Number(u.n) : 0;
      inviteCount = i?.n != null ? Number(i.n) : 0;
      leadCount = l?.n != null ? Number(l.n) : 0;
    } catch {
      // Return 0 usage if db fails, but limits will still be enforced below if max is hit
    }

    let aiCredits = { used: 0, max: limitsFor(planName).aiCredits };
    try {
      aiCredits = await this.aiCredits(organizationId, planName);
    } catch {
      // show the plan max with 0 used if the read fails
    }

    return {
      plan: planName,
      seats: { current: userCount + inviteCount, max: maxSeats },
      leads: { current: leadCount, max: maxLeads },
      aiCredits: { current: aiCredits.used, max: aiCredits.max },
    };
  }

  // Counts active users + still-open invitations against the seat limit.
  static async assertCanAddSeat(organizationId: string) {
    const stats = await this.getUsageStats(organizationId);
    if (stats.seats.max === Infinity) return;
    if (stats.seats.current >= stats.seats.max) {
      throw new Error(`Your plan allows ${stats.seats.max} seats. Upgrade to add more.`);
    }
  }

  static async assertCanAddLead(organizationId: string) {
    const stats = await this.getUsageStats(organizationId);
    if (stats.leads.max === Infinity) return;
    if (stats.leads.current >= stats.leads.max) {
      throw new Error(`Your plan allows ${stats.leads.max} leads. Upgrade to add more.`);
    }
  }

  // Background AI (inbound reply tagging) — paid plans only.
  static async aiAutoTagAllowed(organizationId: string) {
    return limitsFor(await this.plan(organizationId)).aiAutoTag;
  }

  static async aiCredits(organizationId: string, knownPlan?: string) {
    const max = limitsFor(knownPlan ?? (await this.plan(organizationId))).aiCredits;
    const [row] = await db
      .select({ used: organizations.aiCreditsUsed, period: organizations.aiCreditsPeriod })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    return { used: row?.period === currentPeriod() ? row.used : 0, max };
  }

  // Atomically spends one AI credit. One UPDATE that resets on a new month and refuses at the cap,
  // so concurrent requests can't overdraw. false = out of credits for this month.
  static async useAiCredit(organizationId: string): Promise<boolean> {
    const max = limitsFor(await this.plan(organizationId)).aiCredits;
    const period = currentPeriod();
    const rows = await db
      .update(organizations)
      .set({
        aiCreditsUsed: sql`CASE WHEN ${organizations.aiCreditsPeriod} = ${period} THEN ${organizations.aiCreditsUsed} + 1 ELSE 1 END`,
        aiCreditsPeriod: period,
      })
      .where(and(
        eq(organizations.id, organizationId),
        sql`(${organizations.aiCreditsPeriod} IS DISTINCT FROM ${period} OR ${organizations.aiCreditsUsed} < ${max})`,
      ))
      .returning({ id: organizations.id });
    return rows.length > 0;
  }

  // Gives a credit back when the AI call failed and the user got the non-AI fallback.
  static async refundAiCredit(organizationId: string) {
    await db
      .update(organizations)
      .set({ aiCreditsUsed: sql`GREATEST(${organizations.aiCreditsUsed} - 1, 0)` })
      .where(and(eq(organizations.id, organizationId), eq(organizations.aiCreditsPeriod, currentPeriod())));
  }

  // Message contains "plan" so actionFail maps it to code LIMIT → the UI opens the upgrade dialog.
  static async assertCanAdd(organizationId: string, resource: CountedResource, adding = 1) {
    const plan = await this.plan(organizationId);
    const max = limitsFor(plan)[resource];
    if (max === Infinity) return;
    const { table, org, label } = COUNTED[resource];
    const [row] = await db.select({ n: count() }).from(table).where(eq(org, organizationId));
    if (Number(row?.n ?? 0) + adding > max) {
      const next = limitsFor(plan) === PLAN_LIMITS.free ? "Starter or Unlimited" : "Unlimited";
      throw new Error(`Your ${plan === "free" ? "Free" : "current"} plan allows ${max} ${label}. Upgrade to ${next} to add more.`);
    }
  }

  // A downgraded workspace may hold more than its plan allows. Only the oldest N keep running;
  // the rest pause until the org upgrades. null = no cap (paid plan).
  static async runnableIds(organizationId: string, resource: "automations" | "sequences"): Promise<Set<string> | null> {
    const max = limitsFor(await this.plan(organizationId))[resource];
    if (max === Infinity) return null;
    const { table, org, id, createdAt } = COUNTED[resource];
    const rows = await db.select({ id }).from(table).where(eq(org, organizationId)).orderBy(asc(createdAt)).limit(max);
    return new Set(rows.map((r) => r.id));
  }
}
