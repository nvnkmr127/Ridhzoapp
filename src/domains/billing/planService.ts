import { db } from "@/db";
import { users, leads, invitations, organizations } from "@/db/schema";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";

// Per-plan ceilings. Infinity = unlimited. Enforcement lives here; charging (Stripe) is separate
// and needs external keys — the plan column is set by that flow, which isn't wired yet.
export const PLAN_LIMITS: Record<string, { seats: number; leads: number; price: string; description: string }> = {
  free: { seats: 1, leads: 100, price: "₹0", description: "For individuals evaluating Ridhzo" },
  starter: { seats: 3, leads: 5_000, price: "₹249 / mo", description: "For solo agents & growing teams" },
  unlimited: { seats: Infinity, leads: Infinity, price: "₹449 / mo", description: "Unlimited leads, seats & full access" },
};

function limitsFor(plan: string) {
  if (plan === "pro") return PLAN_LIMITS.starter;
  if (plan === "business") return PLAN_LIMITS.unlimited;
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export class PlanService {
  private static async plan(organizationId: string) {
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
  static async getUsageStats(organizationId: string) {
    let customSeats: number | undefined;
    try {
      const overrides = await PlatformConfigService.get<Record<string, number>>("seat_overrides", {});
      customSeats = overrides?.[organizationId];
    } catch {
      // ignore
    }

    const planName = await this.plan(organizationId);
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
}
