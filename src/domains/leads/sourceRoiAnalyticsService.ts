import { db } from "@/db";
import { leads, leadSources } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SourceRoiMetric {
  sourceId: string | null;
  sourceName: string;
  sourceType: string;
  totalLeads: number;
  wonLeads: number;
  winRatePercentage: number;
  totalRevenue: number;
  avgDealValue: number;
}

export class SourceRoiAnalyticsService {
  /**
   * Computes lead source attribution, win rates, and revenue ROI performance per channel for an organization.
   */
  static async getLeadSourceRoiMetrics(
    organizationId: string,
    preloadedLeads?: { sourceId: string | null; status: string | null; expectedValue: string | null }[]
  ): Promise<SourceRoiMetric[]> {
    const sourcesList = await db
      .select({
        id: leadSources.id,
        name: leadSources.name,
        type: leadSources.type,
      })
      .from(leadSources)
      .where(eq(leadSources.organizationId, organizationId));

    const sourceMap: Record<string, { name: string; type: string }> = {};
    for (const s of sourcesList) {
      sourceMap[s.id] = { name: s.name, type: s.type ?? "custom" };
    }

    const leadRows = preloadedLeads ?? await db
      .select({
        sourceId: leads.sourceId,
        status: leads.status,
        expectedValue: leads.expectedValue,
      })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    const grouped: Record<
      string,
      { sourceId: string | null; totalLeads: number; wonLeads: number; totalRevenue: number }
    > = {};

    for (const l of leadRows) {
      const key = l.sourceId ?? "unattributed";
      if (!grouped[key]) {
        grouped[key] = { sourceId: l.sourceId, totalLeads: 0, wonLeads: 0, totalRevenue: 0 };
      }
      grouped[key].totalLeads += 1;

      if (l.status === "won") {
        grouped[key].wonLeads += 1;
        const val = Number(l.expectedValue ?? 0);
        grouped[key].totalRevenue += isNaN(val) ? 0 : val;
      }
    }

    const results: SourceRoiMetric[] = [];

    for (const [key, g] of Object.entries(grouped)) {
      const info = g.sourceId ? sourceMap[g.sourceId] : null;
      const sourceName = info ? info.name : key === "unattributed" ? "Unattributed / Direct" : "Unknown Source";
      const sourceType = info ? info.type : "direct";

      const winRatePercentage = g.totalLeads > 0 ? Math.round((g.wonLeads / g.totalLeads) * 1000) / 10 : 0;
      const avgDealValue = g.wonLeads > 0 ? Math.round((g.totalRevenue / g.wonLeads) * 100) / 100 : 0;

      results.push({
        sourceId: g.sourceId,
        sourceName,
        sourceType,
        totalLeads: g.totalLeads,
        wonLeads: g.wonLeads,
        winRatePercentage,
        totalRevenue: g.totalRevenue,
        avgDealValue,
      });
    }

    results.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return results;
  }
}
