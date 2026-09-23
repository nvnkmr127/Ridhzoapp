import { db } from "@/db";
import { leads, leadStatusHistory } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface StageVelocity {
  avgHours: number;
  leadCount: number;
}

export interface PipelineVelocityMetrics {
  stageVelocities: Record<string, StageVelocity>;
  conversionRates: {
    newToActiveRate: number;
    activeToWonRate: number;
    overallWinRate: number;
  };
  bottleneckStage: string | null;
}

export class PipelineVelocityService {
  /**
   * Calculates status stage velocity (residence time in hours) and funnel conversion rates for an organization.
   */
  static async getVelocityMetrics(
    organizationId: string,
    preloadedLeads?: { id: string; status: string | null; createdAt: Date }[]
  ): Promise<PipelineVelocityMetrics> {
    const orgLeads = preloadedLeads ?? await db
      .select({ id: leads.id, status: leads.status, createdAt: leads.createdAt })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    if (orgLeads.length === 0) {
      return {
        stageVelocities: {},
        conversionRates: { newToActiveRate: 0, activeToWonRate: 0, overallWinRate: 0 },
        bottleneckStage: null,
      };
    }

    const historyRows = await db
      .select({
        leadId: leadStatusHistory.leadId,
        oldStatus: leadStatusHistory.oldStatus,
        newStatus: leadStatusHistory.newStatus,
        createdAt: leadStatusHistory.createdAt,
      })
      .from(leadStatusHistory)
      .innerJoin(leads, eq(leadStatusHistory.leadId, leads.id))
      .where(eq(leads.organizationId, organizationId))
      .orderBy(leadStatusHistory.createdAt);

    // Track total hours and count per status stage
    const stageSums: Record<string, { totalHours: number; count: number }> = {
      new: { totalHours: 0, count: 0 },
      active: { totalHours: 0, count: 0 },
    };

    // Organize transitions per lead
    const leadTransitions: Record<string, { status: string; timestamp: Date }[]> = {};
    for (const l of orgLeads) {
      leadTransitions[l.id] = [{ status: "new", timestamp: l.createdAt }];
    }

    for (const h of historyRows) {
      if (leadTransitions[h.leadId]) {
        leadTransitions[h.leadId].push({ status: h.newStatus, timestamp: h.createdAt });
      }
    }

    // Calculate durations between status changes
    for (const transitions of Object.values(leadTransitions)) {
      for (let i = 0; i < transitions.length - 1; i++) {
        const current = transitions[i];
        const next = transitions[i + 1];
        const hours = (new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime()) / (1000 * 60 * 60);

        if (!stageSums[current.status]) {
          stageSums[current.status] = { totalHours: 0, count: 0 };
        }
        stageSums[current.status].totalHours += Math.max(0, hours);
        stageSums[current.status].count += 1;
      }
    }

    const stageVelocities: Record<string, StageVelocity> = {};
    let maxAvgHours = -1;
    let bottleneckStage: string | null = null;

    for (const [stage, data] of Object.entries(stageSums)) {
      const avgHours = data.count > 0 ? Math.round((data.totalHours / data.count) * 10) / 10 : 0;
      stageVelocities[stage] = { avgHours, leadCount: data.count };

      if (avgHours > maxAvgHours && data.count > 0) {
        maxAvgHours = avgHours;
        bottleneckStage = stage;
      }
    }

    // Funnel conversion counts
    const totalLeadsCount = orgLeads.length;
    const activeCount = orgLeads.filter((l) => l.status === "active" || l.status === "won").length;
    const wonCount = orgLeads.filter((l) => l.status === "won").length;

    const newToActiveRate = totalLeadsCount > 0 ? Math.round((activeCount / totalLeadsCount) * 1000) / 10 : 0;
    const activeToWonRate = activeCount > 0 ? Math.round((wonCount / activeCount) * 1000) / 10 : 0;
    const overallWinRate = totalLeadsCount > 0 ? Math.round((wonCount / totalLeadsCount) * 1000) / 10 : 0;

    return {
      stageVelocities,
      conversionRates: {
        newToActiveRate,
        activeToWonRate,
        overallWinRate,
      },
      bottleneckStage,
    };
  }
}
