import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface LocationMetric {
  locationName: string;
  totalLeads: number;
  wonLeads: number;
  winRatePercentage: number;
  totalRevenue: number;
}

export class LeadGeoAnalyticsService {
  /**
   * Aggregates lead volume, win rates, and revenue performance by geographic territory.
   */
  static async getGeoAnalytics(
    organizationId: string,
    preloadedLeads?: {
      id: string;
      status: string | null;
      expectedValue: string | null;
      customData: unknown;
    }[]
  ): Promise<LocationMetric[]> {
    const orgLeads = preloadedLeads ?? await db
      .select({
        id: leads.id,
        status: leads.status,
        expectedValue: leads.expectedValue,
        customData: leads.customData,
      })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    const grouped: Record<
      string,
      { totalLeads: number; wonLeads: number; totalRevenue: number }
    > = {};

    for (const lead of orgLeads) {
      const custom = (lead.customData as Record<string, any>) || {};
      const locRaw =
        custom.city || custom.country || custom.location || custom.state || custom.region || "Unspecified Territory";

      const locKey = String(locRaw).trim() || "Unspecified Territory";

      if (!grouped[locKey]) {
        grouped[locKey] = { totalLeads: 0, wonLeads: 0, totalRevenue: 0 };
      }

      grouped[locKey].totalLeads += 1;

      if (lead.status === "won") {
        grouped[locKey].wonLeads += 1;
        const val = Number(lead.expectedValue ?? 0);
        grouped[locKey].totalRevenue += isNaN(val) ? 0 : val;
      }
    }

    const results: LocationMetric[] = Object.entries(grouped).map(([locationName, counts]) => {
      const winRatePercentage =
        counts.totalLeads > 0 ? Math.round((counts.wonLeads / counts.totalLeads) * 1000) / 10 : 0;

      return {
        locationName,
        totalLeads: counts.totalLeads,
        wonLeads: counts.wonLeads,
        winRatePercentage,
        totalRevenue: Math.round(counts.totalRevenue * 100) / 100,
      };
    });

    results.sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalLeads - a.totalLeads);
    return results;
  }
}
