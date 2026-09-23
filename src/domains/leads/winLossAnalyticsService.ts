import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface LossReasonSummary {
  reason: string;
  count: number;
  percentage: number;
}

export interface WinLossAnalytics {
  totalClosedLeads: number;
  wonCount: number;
  lostCount: number;
  unqualifiedCount: number;
  winRatePercentage: number;
  lossReasonBreakdown: LossReasonSummary[];
}

export class WinLossAnalyticsService {
  /**
   * Computes win/loss performance metrics and categorizes loss reason taxonomies.
   */
  static async getWinLossAnalytics(
    organizationId: string,
    preloadedLeads?: { id: string; status: string | null; lostReason: string | null }[]
  ): Promise<WinLossAnalytics> {
    const closedLeads = preloadedLeads
      ? preloadedLeads.filter((l) => l.status && ["won", "lost", "unqualified"].includes(l.status))
      : await db
          .select({
            id: leads.id,
            status: leads.status,
            lostReason: leads.lostReason,
          })
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, organizationId),
              inArray(leads.status, ["won", "lost", "unqualified"])
            )
          );

    if (closedLeads.length === 0) {
      return {
        totalClosedLeads: 0,
        wonCount: 0,
        lostCount: 0,
        unqualifiedCount: 0,
        winRatePercentage: 0,
        lossReasonBreakdown: [],
      };
    }

    let wonCount = 0;
    let lostCount = 0;
    let unqualifiedCount = 0;

    for (const lead of closedLeads) {
      if (lead.status === "won") wonCount++;
      else if (lead.status === "lost") lostCount++;
      else if (lead.status === "unqualified") unqualifiedCount++;
    }

    const winRatePercentage =
      closedLeads.length > 0 ? Math.round((wonCount / closedLeads.length) * 1000) / 10 : 0;

    // Fetch activity notes for lost/unqualified leads to categorize loss reasons
    const lossMap: Record<string, number> = {
      "Price / Budget Constraints": 0,
      "Competitor Selected": 0,
      "Product Fit / Missing Features": 0,
      "No Response / Ghosted": 0,
      "Unqualified / Out of Scope": 0,
      "Other / Unspecified": 0,
    };

    // Bucket by the structured reason captured at close time. Leads closed without a reason
    // (older data) fall into "Other / Unspecified".
    const buckets = Object.keys(lossMap);
    for (const lead of closedLeads) {
      if (lead.status !== "lost" && lead.status !== "unqualified") continue;
      const bucket = lead.lostReason
        ? buckets.find((b) => lead.lostReason!.startsWith(b)) ?? "Other / Unspecified"
        : "Other / Unspecified";
      lossMap[bucket]++;
    }

    const totalLostReasonHits = Object.values(lossMap).reduce((a, b) => a + b, 0) || 1;

    const lossReasonBreakdown: LossReasonSummary[] = Object.entries(lossMap)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round((count / totalLostReasonHits) * 1000) / 10,
      }))
      .filter((item) => item.count > 0);

    lossReasonBreakdown.sort((a, b) => b.count - a.count);

    return {
      totalClosedLeads: closedLeads.length,
      wonCount,
      lostCount,
      unqualifiedCount,
      winRatePercentage,
      lossReasonBreakdown,
    };
  }
}
