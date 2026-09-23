import { db } from "@/db";
import { leads, activities } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";

export interface LeadVelocitySummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  recentTouchpoints: number;
  previousTouchpoints: number;
  velocityRatio: number;
  trend: "accelerating" | "decelerating" | "stable";
}

export interface EngagementVelocityMetrics {
  totalActiveLeadsTracked: number;
  acceleratingCount: number;
  deceleratingCount: number;
  stableCount: number;
  avgWeeklyTouchpoints: number;
  acceleratingLeads: LeadVelocitySummary[];
  deceleratingLeads: LeadVelocitySummary[];
}

export class EngagementVelocityService {
  /**
   * Evaluates activity touchpoint momentum comparing recent (0-7d) vs previous (8-14d) windows.
   */
  static async getEngagementVelocity(organizationId: string): Promise<EngagementVelocityMetrics> {
    const activeLeads = await db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        status: leads.status,
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
        totalActiveLeadsTracked: 0,
        acceleratingCount: 0,
        deceleratingCount: 0,
        stableCount: 0,
        avgWeeklyTouchpoints: 0,
        acceleratingLeads: [],
        deceleratingLeads: [],
      };
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const actRows = await db
      .select({
        leadId: activities.leadId,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .innerJoin(leads, eq(activities.leadId, leads.id))
      .where(
        and(
          eq(leads.organizationId, organizationId),
          inArray(leads.status, ["new", "active"]),
          gte(activities.createdAt, fourteenDaysAgo)
        )
      );

    const touchpointMap: Record<string, { recent: number; previous: number }> = {};
    for (const lead of activeLeads) {
      touchpointMap[lead.id] = { recent: 0, previous: 0 };
    }

    for (const act of actRows) {
      if (!act.leadId || !touchpointMap[act.leadId]) continue;
      const actTime = new Date(act.createdAt).getTime();

      if (actTime >= sevenDaysAgo.getTime()) {
        touchpointMap[act.leadId].recent += 1;
      } else {
        touchpointMap[act.leadId].previous += 1;
      }
    }

    let acceleratingCount = 0;
    let deceleratingCount = 0;
    let stableCount = 0;
    let totalRecentTouchpoints = 0;

    const acceleratingLeads: LeadVelocitySummary[] = [];
    const deceleratingLeads: LeadVelocitySummary[] = [];

    for (const lead of activeLeads) {
      const counts = touchpointMap[lead.id] || { recent: 0, previous: 0 };
      totalRecentTouchpoints += counts.recent;

      let trend: "accelerating" | "decelerating" | "stable" = "stable";
      let velocityRatio = 1.0;

      if (counts.recent > counts.previous) {
        trend = "accelerating";
        acceleratingCount++;
        velocityRatio = counts.previous === 0 ? counts.recent : Math.round((counts.recent / counts.previous) * 10) / 10;
        acceleratingLeads.push({
          ...lead,
          recentTouchpoints: counts.recent,
          previousTouchpoints: counts.previous,
          velocityRatio,
          trend,
        });
      } else if (counts.recent < counts.previous) {
        trend = "decelerating";
        deceleratingCount++;
        velocityRatio = counts.previous === 0 ? 0 : Math.round((counts.recent / counts.previous) * 10) / 10;
        deceleratingLeads.push({
          ...lead,
          recentTouchpoints: counts.recent,
          previousTouchpoints: counts.previous,
          velocityRatio,
          trend,
        });
      } else {
        stableCount++;
      }
    }

    acceleratingLeads.sort((a, b) => b.velocityRatio - a.velocityRatio);
    deceleratingLeads.sort((a, b) => a.velocityRatio - b.velocityRatio);

    const avgWeeklyTouchpoints =
      activeLeads.length > 0 ? Math.round((totalRecentTouchpoints / activeLeads.length) * 10) / 10 : 0;

    return {
      totalActiveLeadsTracked: activeLeads.length,
      acceleratingCount,
      deceleratingCount,
      stableCount,
      avgWeeklyTouchpoints,
      acceleratingLeads,
      deceleratingLeads,
    };
  }
}
