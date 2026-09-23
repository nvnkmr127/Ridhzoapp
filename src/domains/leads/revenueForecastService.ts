import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface StageForecast {
  status: string;
  probabilityWeight: number;
  leadCount: number;
  unweightedValue: number;
  weightedValue: number;
}

export interface RevenueForecast {
  unweightedTotalValue: number;
  weightedProjectedRevenue: number;
  wonRevenue: number;
  stageBreakdown: StageForecast[];
}

const STATUS_WEIGHTS: Record<string, number> = {
  won: 1.0,
  active: 0.5,
  new: 0.1,
  lost: 0.0,
  unqualified: 0.0,
};

export class RevenueForecastService {
  /**
   * Calculates weighted pipeline revenue projection and status stage financial breakdown for an organization.
   */
  static async getRevenueForecast(
    organizationId: string,
    preloadedLeads?: { id: string; status: string | null; expectedValue: string | null }[]
  ): Promise<RevenueForecast> {
    const orgLeads = preloadedLeads ?? await db
      .select({
        id: leads.id,
        status: leads.status,
        expectedValue: leads.expectedValue,
      })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    const stageMap: Record<string, { count: number; unweighted: number; weighted: number }> = {
      new: { count: 0, unweighted: 0, weighted: 0 },
      active: { count: 0, unweighted: 0, weighted: 0 },
      won: { count: 0, unweighted: 0, weighted: 0 },
      lost: { count: 0, unweighted: 0, weighted: 0 },
      unqualified: { count: 0, unweighted: 0, weighted: 0 },
    };

    let unweightedTotalValue = 0;
    let weightedProjectedRevenue = 0;
    let wonRevenue = 0;

    for (const l of orgLeads) {
      const val = Number(l.expectedValue ?? 0);
      const cleanVal = isNaN(val) ? 0 : val;
      const status = l.status || "new";
      const weight = STATUS_WEIGHTS[status] ?? 0.1;
      const weightedVal = cleanVal * weight;

      if (!stageMap[status]) {
        stageMap[status] = { count: 0, unweighted: 0, weighted: 0 };
      }

      stageMap[status].count += 1;
      stageMap[status].unweighted += cleanVal;
      stageMap[status].weighted += weightedVal;

      unweightedTotalValue += cleanVal;
      weightedProjectedRevenue += weightedVal;

      if (status === "won") {
        wonRevenue += cleanVal;
      }
    }

    const stageBreakdown: StageForecast[] = Object.entries(stageMap).map(([status, data]) => ({
      status,
      probabilityWeight: STATUS_WEIGHTS[status] ?? 0.1,
      leadCount: data.count,
      unweightedValue: Math.round(data.unweighted * 100) / 100,
      weightedValue: Math.round(data.weighted * 100) / 100,
    }));

    return {
      unweightedTotalValue: Math.round(unweightedTotalValue * 100) / 100,
      weightedProjectedRevenue: Math.round(weightedProjectedRevenue * 100) / 100,
      wonRevenue: Math.round(wonRevenue * 100) / 100,
      stageBreakdown,
    };
  }
}
