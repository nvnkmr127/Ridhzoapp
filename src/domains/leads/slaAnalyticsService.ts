import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq, and, isNull, sql, type SQL } from "drizzle-orm";

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
      firstContactedAt?: Date | null;
      status: string;
    }[],
    /** Scope for the SQL path (e.g. the dashboard's date/owner/team filters). Default: the whole org. */
    where?: SQL,
  ): Promise<SlaMetrics> {
    if (!preloadedLeads) return this.aggregate(organizationId, slaMinutesThreshold, where);
    const orgLeads = preloadedLeads;

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

      // Response time is to the FIRST contact; fall back to last contact only for rows recorded
      // before first_contacted_at existed.
      const firstContact = lead.firstContactedAt ?? lead.lastContactedAt;
      if (firstContact) {
        contactedCount++;
        const contactTime = new Date(firstContact).getTime();
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

  // Same numbers as the loop above, aggregated in Postgres — the dashboard used to load every lead
  // of the tenant into Node for this card. Response time is to the FIRST contact (last contact only
  // for rows from before first_contacted_at existed).
  private static async aggregate(organizationId: string, threshold: number, where?: SQL): Promise<SlaMetrics> {
    const fc = sql`coalesce(${leads.firstContactedAt}, ${leads.lastContactedAt})`;
    const mins = sql`greatest(0, extract(epoch from (${fc} - ${leads.createdAt})) / 60)`;
    const ageMins = sql`extract(epoch from ((now() at time zone 'utc') - ${leads.createdAt})) / 60`;
    const [r] = await db
      .select({
        total: sql<number>`count(*)::int`,
        contacted: sql<number>`(count(*) filter (where ${fc} is not null))::int`,
        compliant: sql<number>`(count(*) filter (where ${fc} is not null and ${mins} <= ${threshold}))::int`,
        breached: sql<number>`(count(*) filter (where (${fc} is not null and ${mins} > ${threshold}) or (${fc} is null and ${ageMins} > ${threshold})))::int`,
        avg: sql<number | null>`(avg(${mins}) filter (where ${fc} is not null))::float`,
      })
      .from(leads)
      .where(where ?? and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));
    const total = Number(r?.total ?? 0);
    const contacted = Number(r?.contacted ?? 0);
    const compliant = Number(r?.compliant ?? 0);
    return {
      totalLeads: total,
      contactedLeads: contacted,
      uncontactedLeads: total - contacted,
      slaBreachedCount: Number(r?.breached ?? 0),
      slaCompliantCount: compliant,
      complianceRatePercentage: total > 0 ? Math.round((compliant / total) * 1000) / 10 : 100,
      avgFirstContactMinutes: r?.avg == null ? 0 : Math.round(Number(r.avg) * 10) / 10,
    };
  }
}
