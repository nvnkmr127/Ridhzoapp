import { db } from "@/db";
import { users, leads, invitations, organizations } from "@/db/schema";
import { and, count, eq, gt, isNull } from "drizzle-orm";

// Per-plan ceilings. Infinity = unlimited. Enforcement lives here; charging (Stripe) is separate
// and needs external keys — the plan column is set by that flow, which isn't wired yet.
export const PLAN_LIMITS: Record<string, { seats: number; leads: number }> = {
  free: { seats: 3, leads: 500 },
  pro: { seats: 15, leads: 25_000 },
  business: { seats: Infinity, leads: Infinity },
};

function limitsFor(plan: string) {
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
      if (org.planStatus && org.planStatus !== "active") return "free";
      return org.plan ?? "free";
    } catch {
      return "free";
    }
  }

  // Counts active users + still-open invitations against the seat limit.
  static async assertCanAddSeat(organizationId: string) {
    const { seats } = limitsFor(await this.plan(organizationId));
    if (seats === Infinity) return;
    try {
      const resU = await db.select({ n: count() }).from(users).where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)));
      const resI = await db.select({ n: count() }).from(invitations).where(and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
      const u = Array.isArray(resU) ? resU[0] : resU;
      const i = Array.isArray(resI) ? resI[0] : resI;
      const userCount = u?.n != null ? Number(u.n) : 0;
      const inviteCount = i?.n != null ? Number(i.n) : 0;
      if (userCount + inviteCount >= seats) {
        throw new Error(`Your plan allows ${seats} seats. Upgrade to add more.`);
      }
    } catch (e) {
      if ((e as Error)?.message?.includes("plan allows")) throw e;
    }
  }

  static async assertCanAddLead(organizationId: string) {
    const { leads: max } = limitsFor(await this.plan(organizationId));
    if (max === Infinity) return;
    try {
      const resL = await db.select({ n: count() }).from(leads).where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));
      const l = Array.isArray(resL) ? resL[0] : resL;
      const leadCount = l?.n != null ? Number(l.n) : 0;
      if (leadCount >= max) {
        throw new Error(`Your plan allows ${max} leads. Upgrade to add more.`);
      }
    } catch (e) {
      if ((e as Error)?.message?.includes("plan allows")) throw e;
    }
  }
}
