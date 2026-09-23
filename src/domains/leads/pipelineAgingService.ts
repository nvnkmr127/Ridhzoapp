import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface AgeBucketSummary {
  bucketKey: string;
  label: string;
  count: number;
  totalValue: number;
  percentage: number;
}

export interface PipelineAgingMatrix {
  totalActiveLeads: number;
  avgLeadAgeDays: number;
  staleValueAtRisk: number;
  buckets: AgeBucketSummary[];
}

export class PipelineAgingService {
  /**
   * Evaluates age distribution of active pipeline deals across 0-7d, 8-14d, 15-30d, and 30d+ age buckets.
   */
  static async getPipelineAgingMatrix(
    organizationId: string,
    preloadedLeads?: {
      id: string;
      status: string | null;
      expectedValue: string | null;
      createdAt: Date;
    }[]
  ): Promise<PipelineAgingMatrix> {
    const activeLeads = preloadedLeads
      ? preloadedLeads.filter((l) => l.status && ["new", "active"].includes(l.status))
      : await db
          .select({
            id: leads.id,
            status: leads.status,
            expectedValue: leads.expectedValue,
            createdAt: leads.createdAt,
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
        avgLeadAgeDays: 0,
        staleValueAtRisk: 0,
        buckets: [
          { bucketKey: "fresh", label: "0 - 7 Days (Fresh)", count: 0, totalValue: 0, percentage: 0 },
          { bucketKey: "moderate", label: "8 - 14 Days (Moderate)", count: 0, totalValue: 0, percentage: 0 },
          { bucketKey: "aging", label: "15 - 30 Days (Aging)", count: 0, totalValue: 0, percentage: 0 },
          { bucketKey: "stale", label: "30+ Days (Stale)", count: 0, totalValue: 0, percentage: 0 },
        ],
      };
    }

    const now = Date.now();
    let totalDaysSum = 0;

    const bucketCounts: Record<string, { count: number; value: number }> = {
      fresh: { count: 0, value: 0 },
      moderate: { count: 0, value: 0 },
      aging: { count: 0, value: 0 },
      stale: { count: 0, value: 0 },
    };

    for (const lead of activeLeads) {
      const ageMs = now - new Date(lead.createdAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      totalDaysSum += ageDays;

      const val = Number(lead.expectedValue ?? 0);
      const cleanVal = isNaN(val) ? 0 : val;

      if (ageDays <= 7) {
        bucketCounts.fresh.count++;
        bucketCounts.fresh.value += cleanVal;
      } else if (ageDays <= 14) {
        bucketCounts.moderate.count++;
        bucketCounts.moderate.value += cleanVal;
      } else if (ageDays <= 30) {
        bucketCounts.aging.count++;
        bucketCounts.aging.value += cleanVal;
      } else {
        bucketCounts.stale.count++;
        bucketCounts.stale.value += cleanVal;
      }
    }

    const totalActiveLeads = activeLeads.length;
    const avgLeadAgeDays = Math.round((totalDaysSum / totalActiveLeads) * 10) / 10;
    const staleValueAtRisk = Math.round(bucketCounts.stale.value * 100) / 100;

    const labelsMap: Record<string, string> = {
      fresh: "0 - 7 Days (Fresh)",
      moderate: "8 - 14 Days (Moderate)",
      aging: "15 - 30 Days (Aging)",
      stale: "30+ Days (Stale)",
    };

    const buckets: AgeBucketSummary[] = Object.entries(bucketCounts).map(([key, data]) => ({
      bucketKey: key,
      label: labelsMap[key],
      count: data.count,
      totalValue: Math.round(data.value * 100) / 100,
      percentage: Math.round((data.count / totalActiveLeads) * 1000) / 10,
    }));

    return {
      totalActiveLeads,
      avgLeadAgeDays,
      staleValueAtRisk,
      buckets,
    };
  }
}
