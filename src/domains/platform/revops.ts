import { canonicalPlan, isPayingOrg, PLAN_MONTHLY_PRICE } from "@/domains/billing/planNames";
import { db } from "@/db";
import { organizations, leads, users } from "@/db/schema";
import { count, eq, isNull, max, and, gte } from "drizzle-orm";

export interface TenantHealthSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  leadCount: number;
  userCount: number;
  lastActiveAt: string | null;
  daysInactive: number;
  health: "healthy" | "slowing" | "at_risk" | "critical";
  /** AI credits left this month on the real meter (plan allowance + any super-admin bonus − used). */
  aiCreditsLeft: number;
  aiCreditsMax: number;
}


export interface LifecycleFunnelStage {
  stage: "signed_up" | "activated" | "paid" | "churned";
  label: string;
  count: number;
  rate: number;
  dropoffRate?: number;
}

export interface LifecycleFunnel {
  totalSignedUp: number;
  totalActivated: number;
  totalPaid: number;
  totalChurned: number;
  activationRate: number;
  paidConversionRate: number;
  churnRate: number;
  stages: LifecycleFunnelStage[];
}

export interface RevOpsMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  paidAccounts: number;
  /** Paid plans given free by an admin (e.g. agency clients) — not in MRR. */
  complimentaryAccounts: number;
  freeAccounts: number;
  churnRiskCount: number;
  /** List-price MRR of paying accounts flagged at-risk/critical by the health model — a risk, not churn. */
  churnRiskMrr: number;
  /** MRR from paying accounts created in the last 30 days. */
  newAccountsMrr: number;
  funnel?: LifecycleFunnel;
}

const PLAN_PRICES = PLAN_MONTHLY_PRICE;

export class RevOpsService {
  // MRR at list price for real payers only (trials and complimentary plans aren't revenue).
  // ponytail: list price, not charged amount — coupons/annual discounts aren't reflected; use the
  // invoice ledger if MRR must match cash exactly.
  private static async revenue() {
    const orgs = await db
      .select({
        plan: organizations.plan,
        planStatus: organizations.planStatus,
        createdAt: organizations.createdAt,
        complimentary: organizations.complimentary,
        trialEndsAt: organizations.trialEndsAt,
      })
      .from(organizations);
    const since = Date.now() - 30 * 86_400_000;
    let mrr = 0, paidAccounts = 0, freeAccounts = 0, complimentaryAccounts = 0, newAccountsMrr = 0;
    for (const org of orgs) {
      if (org.complimentary === 1) complimentaryAccounts++;
      if (isPayingOrg(org)) {
        const price = PLAN_PRICES[canonicalPlan(org.plan)];
        mrr += price;
        paidAccounts++;
        if (new Date(org.createdAt).getTime() >= since) newAccountsMrr += price;
      } else {
        freeAccounts++;
      }
    }
    return { mrr, paidAccounts, freeAccounts, complimentaryAccounts, newAccountsMrr };
  }

  // Just the headline numbers (console header) — no health model or funnel.
  static async getSummary(): Promise<{ mrr: number; paidAccounts: number }> {
    const { mrr, paidAccounts } = await this.revenue();
    return { mrr, paidAccounts };
  }

  static async getMetrics(): Promise<RevOpsMetrics> {
    const [{ mrr, paidAccounts, freeAccounts, complimentaryAccounts, newAccountsMrr }, healthList, funnel] = await Promise.all([
      this.revenue(),
      this.listTenantHealth(50),
      this.getLifecycleFunnel(30),
    ]);
    const atRiskList = healthList.filter((t) => t.health === "at_risk" || t.health === "critical");
    return {
      mrr,
      arr: mrr * 12,
      arpu: paidAccounts > 0 ? Math.round(mrr / paidAccounts) : 0,
      paidAccounts,
      complimentaryAccounts,
      freeAccounts,
      churnRiskCount: atRiskList.length,
      churnRiskMrr: atRiskList.reduce((acc, t) => acc + (PLAN_PRICES[canonicalPlan(t.plan)] ?? 0), 0),
      newAccountsMrr,
      funnel,
    };
  }

  static async getLifecycleFunnel(days?: number): Promise<LifecycleFunnel> {
    const cohortCutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

    // Single query grouping tenants by lifecycle stage
    const rows = await db
      .select({
        id: organizations.id,
        plan: organizations.plan,
        planStatus: organizations.planStatus,
        suspendedAt: organizations.suspendedAt,
        complimentary: organizations.complimentary,
        trialEndsAt: organizations.trialEndsAt,
        leadCount: count(leads.id),
      })
      .from(organizations)
      .leftJoin(leads, and(eq(leads.organizationId, organizations.id), isNull(leads.deletedAt)))
      .where(cohortCutoff ? gte(organizations.createdAt, cohortCutoff) : undefined)
      .groupBy(organizations.id);

    const totalSignedUp = rows.length;
    let totalActivated = 0;
    let totalPaid = 0;
    let totalChurned = 0;

    for (const r of rows) {
      if (Number(r.leadCount) > 0) totalActivated++;
      const isSuspended = !!r.suspendedAt;
      const isPaid = isPayingOrg(r) && !isSuspended;
      if (isPaid) totalPaid++;
      const isCancelled = r.planStatus === "cancelled" || r.planStatus === "halted";
      if (isSuspended || isCancelled) totalChurned++;
    }

    const activationRate = totalSignedUp > 0 ? Math.round((totalActivated / totalSignedUp) * 1000) / 10 : 0;
    const paidConversionRate = totalSignedUp > 0 ? Math.round((totalPaid / totalSignedUp) * 1000) / 10 : 0;
    const churnRate = totalSignedUp > 0 ? Math.round((totalChurned / totalSignedUp) * 1000) / 10 : 0;

    const activationDropoff = totalSignedUp > 0 ? Math.round(((totalSignedUp - totalActivated) / totalSignedUp) * 1000) / 10 : 0;
    const paidDropoff = totalActivated > 0 ? Math.round(((totalActivated - totalPaid) / totalActivated) * 1000) / 10 : 0;

    const stages: LifecycleFunnelStage[] = [
      {
        stage: "signed_up",
        label: "Signed Up",
        count: totalSignedUp,
        rate: 100,
      },
      {
        stage: "activated",
        label: "Activated (≥1 Lead)",
        count: totalActivated,
        rate: activationRate,
        dropoffRate: activationDropoff,
      },
      {
        stage: "paid",
        label: "Converted to Paid",
        count: totalPaid,
        rate: paidConversionRate,
        dropoffRate: paidDropoff,
      },
      {
        stage: "churned",
        label: "Churned / Suspended",
        count: totalChurned,
        rate: churnRate,
      },
    ];

    return {
      totalSignedUp,
      totalActivated,
      totalPaid,
      totalChurned,
      activationRate,
      paidConversionRate,
      churnRate,
      stages,
    };
  }

  static async listTenantHealth(limit = 50): Promise<TenantHealthSummary[]> {
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        createdAt: organizations.createdAt,
        aiUsed: organizations.aiCreditsUsed,
        aiPeriod: organizations.aiCreditsPeriod,
      })
      .from(organizations);

    const latestLeads = await db
      .select({
        orgId: leads.organizationId,
        c: count(),
        lastActivity: max(leads.updatedAt),
      })
      .from(leads)
      .where(isNull(leads.deletedAt))
      .groupBy(leads.organizationId);

    const userCounts = await db
      .select({ orgId: users.organizationId, c: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.organizationId);

    const { limitsFor, currentPeriod } = await import("@/domains/billing/planService");
    const period = currentPeriod();

    const leadMap = new Map(latestLeads.map((r) => [r.orgId, { count: Number(r.c), last: r.lastActivity }]));
    const userMap = new Map(userCounts.map((r) => [r.orgId, Number(r.c)]));

    const now = Date.now();

    return orgs.map((o) => {
      const leadInfo = leadMap.get(o.id);
      const userCount = userMap.get(o.id) ?? 0;
      const lastActiveDate = leadInfo?.last ?? o.createdAt;
      const daysInactive = lastActiveDate ? Math.max(0, Math.floor((now - new Date(lastActiveDate).getTime()) / (1000 * 60 * 60 * 24))) : 30;

      let health: "healthy" | "slowing" | "at_risk" | "critical" = "healthy";
      if (daysInactive >= 14) health = "critical";
      else if (daysInactive >= 7) health = "at_risk";
      else if (daysInactive >= 3) health = "slowing";

      const allowance = limitsFor(o.plan ?? "free").aiCredits;
      const used = o.aiPeriod === period ? o.aiUsed : 0;

      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        plan: o.plan ?? "free",
        leadCount: leadInfo?.count ?? 0,
        userCount,
        lastActiveAt: lastActiveDate ? new Date(lastActiveDate).toISOString() : null,
        daysInactive,
        health,
        aiCreditsLeft: Math.max(0, allowance - used),
        aiCreditsMax: allowance - Math.min(0, used),
      };
    })
      // Rank EVERY tenant, then take the worst — not an arbitrary first-N slice of the table.
      .sort((a, b) => b.daysInactive - a.daysInactive)
      .slice(0, limit);
  }

  // Bonus AI credits for THIS month, on the same meter the product actually enforces
  // (organizations.ai_credits_used): granting N lowers this month's usage by N (it can go negative,
  // which is the bonus). A new month resets the meter, so a grant doesn't carry over.
  static async grantCredits(organizationId: string, aiGrant: number): Promise<{ used: number; max: number }> {
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { PlanService, currentPeriod } = await import("@/domains/billing/planService");
    const period = currentPeriod();
    const rows = await db
      .update(organizations)
      .set({
        aiCreditsUsed: sql`CASE WHEN ${organizations.aiCreditsPeriod} = ${period} THEN ${organizations.aiCreditsUsed} - ${aiGrant} ELSE ${-aiGrant} END`,
        aiCreditsPeriod: period,
      })
      .where(eq(organizations.id, organizationId))
      .returning({ id: organizations.id });
    if (!rows.length) throw new Error("Organization not found.");
    return PlanService.aiCredits(organizationId);
  }
}
