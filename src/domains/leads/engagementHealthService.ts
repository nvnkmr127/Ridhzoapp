import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export type HealthTier = "healthy" | "needs_attention" | "at_risk" | "critical";

export interface CriticalLeadSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  daysSinceContact: number;
  ownerId: string | null;
}

export interface EngagementHealthBreakdown {
  totalActiveLeads: number;
  healthyCount: number;
  needsAttentionCount: number;
  atRiskCount: number;
  criticalCount: number;
  healthScorePercentage: number;
  criticalLeads: CriticalLeadSummary[];
}

export class EngagementHealthService {
  /**
   * Evaluates active lead interaction recency and groups organization leads into health tiers.
   */
  static async getEngagementHealthBreakdown(
    organizationId: string,
    preloadedLeads?: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      status: string;
      lastContactedAt: Date | null;
      createdAt: Date;
      ownerId: string | null;
    }[]
  ): Promise<EngagementHealthBreakdown> {
    const activeLeads = preloadedLeads
      ? preloadedLeads.filter((l) => l.status && ["new", "active"].includes(l.status))
      : await db
          .select({
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            email: leads.email,
            status: leads.status,
            lastContactedAt: leads.lastContactedAt,
            createdAt: leads.createdAt,
            ownerId: leads.ownerId,
          })
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, organizationId),
              inArray(leads.status, ["new", "active"])
            )
          );

    if (activeLeads.length === 0) {
      return {
        totalActiveLeads: 0,
        healthyCount: 0,
        needsAttentionCount: 0,
        atRiskCount: 0,
        criticalCount: 0,
        healthScorePercentage: 100,
        criticalLeads: [],
      };
    }

    const now = Date.now();
    let healthyCount = 0;
    let needsAttentionCount = 0;
    let atRiskCount = 0;
    let criticalCount = 0;
    const criticalLeads: CriticalLeadSummary[] = [];

    for (const lead of activeLeads) {
      const refTime = lead.lastContactedAt
        ? new Date(lead.lastContactedAt).getTime()
        : new Date(lead.createdAt).getTime();

      const days = Math.floor((now - refTime) / (1000 * 60 * 60 * 24));

      if (days <= 3) {
        healthyCount++;
      } else if (days <= 7) {
        needsAttentionCount++;
      } else if (days <= 14) {
        atRiskCount++;
      } else {
        criticalCount++;
        criticalLeads.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          daysSinceContact: days,
          ownerId: lead.ownerId,
        });
      }
    }

    const healthySum = healthyCount + needsAttentionCount;
    const healthScorePercentage = Math.round((healthySum / activeLeads.length) * 1000) / 10;

    criticalLeads.sort((a, b) => b.daysSinceContact - a.daysSinceContact);

    return {
      totalActiveLeads: activeLeads.length,
      healthyCount,
      needsAttentionCount,
      atRiskCount,
      criticalCount,
      healthScorePercentage,
      criticalLeads,
    };
  }
}
