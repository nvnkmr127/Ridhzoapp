import { db } from "@/db";
import { users, leads, invitations, organizations, automations, sequences, leadSources } from "@/db/schema";
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";

// Per-plan ceilings. Infinity = unlimited. Enforcement lives here; charging (Stripe) is separate
// and needs external keys — the plan column is set by that flow, which isn't wired yet.
export type PlanLimits = {
  seats: number; leads: number; automations: number; sequences: number; sources: number; ai: boolean;
  price: string; description: string;
};
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { seats: 1, leads: 100, automations: 2, sequences: 2, sources: 1, ai: false, price: "₹0", description: "For individuals evaluating Ridhzo" },
  starter: { seats: 3, leads: 5_000, automations: Infinity, sequences: Infinity, sources: Infinity, ai: true, price: "₹249 / mo", description: "For solo agents & growing teams" },
  unlimited: { seats: Infinity, leads: Infinity, automations: Infinity, sequences: Infinity, sources: Infinity, ai: true, price: "₹449 / mo", description: "Unlimited leads, seats & full access" },
};

// Countable per-org resources capped by plan. Counts every row (active or paused) so pausing
// one can't be used to create more.
const COUNTED = {
  automations: { table: automations, org: automations.organizationId, id: automations.id, createdAt: automations.createdAt, label: "automations" },
  sequences: { table: sequences, org: sequences.organizationId, id: sequences.id, createdAt: sequences.createdAt, label: "sequences" },
  sources: { table: leadSources, org: leadSources.organizationId, label: "lead sources" },
} as const;
export type CountedResource = keyof typeof COUNTED;

export function limitsFor(plan: string) {
  if (plan === "pro") return PLAN_LIMITS.starter;
  if (plan === "business") return PLAN_LIMITS.unlimited;
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
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

    return {
      plan: planName,
      seats: { current: userCount + inviteCount, max: maxSeats },
      leads: { current: leadCount, max: maxLeads }
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

  // AI (drafts, recaps, assistant, sequence generation, intent tagging) is paid-only.
  static async aiAllowed(organizationId: string) {
    return limitsFor(await this.plan(organizationId)).ai;
  }

  // Message contains "plan" so actionFail maps it to code LIMIT → the UI opens the upgrade dialog.
  static async assertCanAdd(organizationId: string, resource: CountedResource, adding = 1) {
    const max = limitsFor(await this.plan(organizationId))[resource];
    if (max === Infinity) return;
    const { table, org, label } = COUNTED[resource];
    const [row] = await db.select({ n: count() }).from(table).where(eq(org, organizationId));
    if (Number(row?.n ?? 0) + adding > max) {
      throw new Error(`The Free plan allows ${max} ${label}. Upgrade to Starter or Unlimited to add more.`);
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
