import { db } from "@/db";
import { organizations, leads, users } from "@/db/schema";
import { count, desc, eq, isNull, max, sql } from "drizzle-orm";
import { PlatformConfigService } from "./configService";

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
  aiCredits: number;
  whatsappCredits: number;
}

export interface MrrWaterfall {
  startingMrr: number;
  newMrr: number;
  expansionMrr: number;
  churnRiskMrr: number;
  netMrr: number;
}

export interface RevOpsMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  paidAccounts: number;
  freeAccounts: number;
  churnRiskCount: number;
  waterfall: MrrWaterfall;
}

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 249,
  business: 449,
};

export class RevOpsService {
  static async getMetrics(): Promise<RevOpsMetrics> {
    const orgs = await db
      .select({
        id: organizations.id,
        plan: organizations.plan,
        planStatus: organizations.planStatus,
        createdAt: organizations.createdAt,
      })
      .from(organizations);

    let mrr = 0;
    let paidAccounts = 0;
    let freeAccounts = 0;
    let newMrr = 0;
    let expansionMrr = 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const org of orgs) {
      if (org.planStatus === "active" && org.plan && PLAN_PRICES[org.plan]) {
        const price = PLAN_PRICES[org.plan];
        mrr += price;
        paidAccounts++;

        if (new Date(org.createdAt).getTime() >= thirtyDaysAgo.getTime()) {
          newMrr += price;
        }
        if (org.plan === "business") {
          expansionMrr += 200; // Expansion delta over pro tier (449 - 249)
        }
      } else {
        freeAccounts++;
      }
    }

    const arr = mrr * 12;
    const arpu = paidAccounts > 0 ? Math.round(mrr / paidAccounts) : 0;

    const healthList = await this.listTenantHealth(50);
    const atRiskList = healthList.filter((t) => t.health === "at_risk" || t.health === "critical");
    const churnRiskCount = atRiskList.length;
    const churnRiskMrr = atRiskList.reduce((acc, t) => acc + (PLAN_PRICES[t.plan] ?? 0), 0);
    const startingMrr = Math.max(0, mrr - newMrr);

    const waterfall: MrrWaterfall = {
      startingMrr,
      newMrr,
      expansionMrr,
      churnRiskMrr,
      netMrr: mrr,
    };

    return {
      mrr,
      arr,
      arpu,
      paidAccounts,
      freeAccounts,
      churnRiskCount,
      waterfall,
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
      })
      .from(organizations)
      .limit(limit);

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

    const creditsMap = await PlatformConfigService.get<
      Record<string, { aiCredits: number; whatsappCredits: number }>
    >("tenant_credits", {});

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

      const credits = creditsMap[o.id] ?? { aiCredits: 100, whatsappCredits: 500 };

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
        aiCredits: credits.aiCredits,
        whatsappCredits: credits.whatsappCredits,
      };
    }).sort((a, b) => b.daysInactive - a.daysInactive);
  }

  static async grantCredits(
    organizationId: string,
    aiGrant: number,
    whatsappGrant: number
  ): Promise<{ aiCredits: number; whatsappCredits: number }> {
    const creditsMap = await PlatformConfigService.get<
      Record<string, { aiCredits: number; whatsappCredits: number }>
    >("tenant_credits", {});

    const current = creditsMap[organizationId] ?? { aiCredits: 100, whatsappCredits: 500 };
    current.aiCredits = Math.max(0, current.aiCredits + aiGrant);
    current.whatsappCredits = Math.max(0, current.whatsappCredits + whatsappGrant);
    creditsMap[organizationId] = current;

    await PlatformConfigService.set("tenant_credits", creditsMap);
    return current;
  }
}
