import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export type QualificationStatus = "SQL" | "MQL" | "Unqualified";

export interface LeadQualificationBreakdown {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  qualificationScore: number;
  qualificationStatus: QualificationStatus;
  hasBudget: boolean;
  hasAuthority: boolean;
  hasNeed: boolean;
  hasTimeline: boolean;
  missingCriteria: string[];
  ownerId: string | null;
}

export interface OrganizationLeadQualificationReport {
  totalActiveLeads: number;
  sqlCount: number;
  mqlCount: number;
  unqualifiedCount: number;
  averageQualificationScore: number;
  leads: LeadQualificationBreakdown[];
}

export class LeadQualificationMatrixService {
  /**
   * Evaluates BANT (Budget, Authority, Need, Timeline) lead qualification scores and readiness status for organization leads.
   */
  static async getQualificationReport(
    organizationId: string,
    preloadedLeads?: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      company: string | null;
      status: string;
      expectedValue: string | null;
      customData: unknown;
      nextFollowUpAt: Date | null;
      ownerId: string | null;
    }[]
  ): Promise<OrganizationLeadQualificationReport> {
    const activeLeads = preloadedLeads
      ? preloadedLeads.filter((l) => l.status && ["new", "active"].includes(l.status))
      : await db
          .select({
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            email: leads.email,
            company: leads.company,
            status: leads.status,
            expectedValue: leads.expectedValue,
            customData: leads.customData,
            nextFollowUpAt: leads.nextFollowUpAt,
            ownerId: leads.ownerId,
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
        sqlCount: 0,
        mqlCount: 0,
        unqualifiedCount: 0,
        averageQualificationScore: 0,
        leads: [],
      };
    }

    let sqlCount = 0;
    let mqlCount = 0;
    let unqualifiedCount = 0;
    let totalScoreSum = 0;
    const leadsReport: LeadQualificationBreakdown[] = [];

    for (const lead of activeLeads) {
      const customData = (lead.customData ?? {}) as Record<string, any>;

      // 1. Budget check (25 pts)
      const hasBudget =
        (lead.expectedValue !== null && parseFloat(String(lead.expectedValue)) > 0) ||
        Boolean(customData.budget || customData.expected_budget || customData.deal_size);

      // 2. Authority check (25 pts)
      const hasAuthority =
        Boolean(lead.company) ||
        Boolean(customData.title || customData.role || customData.decision_maker || customData.designation);

      // 3. Need check (25 pts)
      const hasNeed =
        Boolean(customData.need || customData.requirements || customData.pain_point || customData.use_case || customData.industry);

      // 4. Timeline check (25 pts)
      const hasTimeline =
        Boolean(lead.nextFollowUpAt) ||
        Boolean(customData.timeline || customData.start_date || customData.urgency || customData.deadline);

      const missingCriteria: string[] = [];
      if (!hasBudget) missingCriteria.push("Budget");
      if (!hasAuthority) missingCriteria.push("Authority");
      if (!hasNeed) missingCriteria.push("Need");
      if (!hasTimeline) missingCriteria.push("Timeline");

      const qualificationScore = (hasBudget ? 25 : 0) + (hasAuthority ? 25 : 0) + (hasNeed ? 25 : 0) + (hasTimeline ? 25 : 0);
      totalScoreSum += qualificationScore;

      let qualificationStatus: QualificationStatus = "Unqualified";
      if (qualificationScore >= 75) {
        qualificationStatus = "SQL";
        sqlCount++;
      } else if (qualificationScore >= 50) {
        qualificationStatus = "MQL";
        mqlCount++;
      } else {
        unqualifiedCount++;
      }

      leadsReport.push({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        qualificationScore,
        qualificationStatus,
        hasBudget,
        hasAuthority,
        hasNeed,
        hasTimeline,
        missingCriteria,
        ownerId: lead.ownerId,
      });
    }

    leadsReport.sort((a, b) => b.qualificationScore - a.qualificationScore);

    const averageQualificationScore = Math.round((totalScoreSum / activeLeads.length) * 10) / 10;

    return {
      totalActiveLeads: activeLeads.length,
      sqlCount,
      mqlCount,
      unqualifiedCount,
      averageQualificationScore,
      leads: leadsReport,
    };
  }
}
