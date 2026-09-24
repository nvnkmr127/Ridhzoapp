import { db } from "@/db";
import { CustomStatusSchemaService } from "./customStatusSchemaService";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface CohortMetric {
  cohortMonth: string;
  totalLeads: number;
  wonCount: number;
  activeCount: number;
  lostCount: number;
  conversionRate: number;
  churnRate: number;
}

export class LeadCohortAnalyticsService {
  /**
   * Computes monthly cohort retention, deal conversion, and churn risk curves for an organization.
   */
  static async getCohortAnalytics(
    organizationId: string,
    preloadedLeads?: {
      id: string;
      status: string | null;
      createdAt: Date;
    }[]
  ): Promise<CohortMetric[]> {
    const { cat } = await CustomStatusSchemaService.resolver(organizationId); // custom statuses count by category
    const orgLeads = preloadedLeads ?? await db
      .select({
        id: leads.id,
        status: leads.status,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    const grouped: Record<
      string,
      { total: number; won: number; active: number; lost: number }
    > = {};

    for (const lead of orgLeads) {
      const date = new Date(lead.createdAt);
      const cohortMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!grouped[cohortMonth]) {
        grouped[cohortMonth] = { total: 0, won: 0, active: 0, lost: 0 };
      }

      grouped[cohortMonth].total += 1;
      const status = lead.status || "new";

      if (cat(status) === "won") {
        grouped[cohortMonth].won += 1;
      } else if (cat(status) === "lost" || cat(status) === "unqualified") {
        grouped[cohortMonth].lost += 1;
      } else {
        grouped[cohortMonth].active += 1;
      }
    }

    const results: CohortMetric[] = Object.entries(grouped).map(([cohortMonth, counts]) => {
      const conversionRate =
        counts.total > 0 ? Math.round((counts.won / counts.total) * 1000) / 10 : 0;
      const churnRate =
        counts.total > 0 ? Math.round((counts.lost / counts.total) * 1000) / 10 : 0;

      return {
        cohortMonth,
        totalLeads: counts.total,
        wonCount: counts.won,
        activeCount: counts.active,
        lostCount: counts.lost,
        conversionRate,
        churnRate,
      };
    });

    results.sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth));
    return results;
  }
}
