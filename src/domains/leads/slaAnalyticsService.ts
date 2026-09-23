import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export interface SlaMetrics {
  totalLeads: number;
  contactedLeads: number;
  uncontactedLeads: number;
  slaBreachedCount: number;
  slaCompliantCount: number;
  complianceRatePercentage: number;
  avgFirstContactMinutes: number;
}

export class SlaAnalyticsService {
  /**
   * Computes SLA response metrics and time-to-first-contact performance for an organization.
   * @param organizationId Tenant identifier
   * @param slaMinutesThreshold Target SLA window in minutes (default: 15 mins)
   */
  static async getSlaMetrics(
    organizationId: string,
    slaMinutesThreshold: number = 15,
    preloadedLeads?: {
      id: string;
      createdAt: Date;
      lastContactedAt: Date | null;
      status: string;
    }[]
  ): Promise<SlaMetrics> {
    const orgLeads = preloadedLeads ?? await db
      .select({
        id: leads.id,
        createdAt: leads.createdAt,
        lastContactedAt: leads.lastContactedAt,
        status: leads.status,
      })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));

    if (orgLeads.length === 0) {
      return {
        totalLeads: 0,
        contactedLeads: 0,
        uncontactedLeads: 0,
        slaBreachedCount: 0,
        slaCompliantCount: 0,
        complianceRatePercentage: 100,
        avgFirstContactMinutes: 0,
      };
    }

    let totalFirstContactMinutes = 0;
    let contactedCount = 0;
    let compliantCount = 0;
    let breachedCount = 0;
    const now = Date.now();

    for (const lead of orgLeads) {
      const createdTime = new Date(lead.createdAt).getTime();

      if (lead.lastContactedAt) {
        contactedCount++;
        const contactTime = new Date(lead.lastContactedAt).getTime();
        const diffMinutes = Math.max(0, (contactTime - createdTime) / (1000 * 60));
        totalFirstContactMinutes += diffMinutes;

        if (diffMinutes <= slaMinutesThreshold) {
          compliantCount++;
        } else {
          breachedCount++;
        }
      } else {
        // Uncontacted: check if age exceeds SLA threshold
        const ageMinutes = (now - createdTime) / (1000 * 60);
        if (ageMinutes > slaMinutesThreshold) {
          breachedCount++;
        }
      }
    }

    const uncontactedCount = orgLeads.length - contactedCount;
    const avgFirstContactMinutes =
      contactedCount > 0 ? Math.round((totalFirstContactMinutes / contactedCount) * 10) / 10 : 0;
    const complianceRatePercentage =
      orgLeads.length > 0 ? Math.round((compliantCount / orgLeads.length) * 1000) / 10 : 100;

    return {
      totalLeads: orgLeads.length,
      contactedLeads: contactedCount,
      uncontactedLeads: uncontactedCount,
      slaBreachedCount: breachedCount,
      slaCompliantCount: compliantCount,
      complianceRatePercentage,
      avgFirstContactMinutes,
    };
  }
}
