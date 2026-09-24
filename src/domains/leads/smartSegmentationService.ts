import { db } from "@/db";
import { CustomStatusSchemaService } from "./customStatusSchemaService";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";

export type SmartSegmentKey =
  | "hot_leads"
  | "high_value_at_risk"
  | "unassigned_new"
  | "stale_high_priority";

export interface SmartSegmentSummary {
  key: SmartSegmentKey;
  title: string;
  description: string;
  count: number;
}

export class SmartSegmentationService {
  /**
   * Computes dynamic smart lead segments and rule-based lead counts for an organization.
   */
  static async getSmartSegments(organizationId: string): Promise<SmartSegmentSummary[]> {
    const { cat } = await CustomStatusSchemaService.resolver(organizationId); // custom statuses count by category
    const orgLeads = await db
      .select({
        id: leads.id,
        status: leads.status,
        score: leads.score,
        priority: leads.priority,
        expectedValue: leads.expectedValue,
        ownerId: leads.ownerId,
        lastContactedAt: leads.lastContactedAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    let hotCount = 0;
    let highValueAtRiskCount = 0;
    let unassignedNewCount = 0;
    let staleHighPriorityCount = 0;

    for (const l of orgLeads) {
      const score = l.score ?? 0;
      const status = l.status ?? "new";
      const val = Number(l.expectedValue ?? 0);
      const cleanVal = isNaN(val) ? 0 : val;
      const refTime = l.lastContactedAt
        ? new Date(l.lastContactedAt).getTime()
        : new Date(l.createdAt).getTime();

      const daysInactiveMs = now - refTime;

      // Rule 1: Hot Leads (Score >= 70 & contacted within last 3 days)
      if (score >= 70 && l.lastContactedAt && now - new Date(l.lastContactedAt).getTime() <= threeDaysMs) {
        hotCount++;
      }

      // Rule 2: High Value At Risk (Value >= 10000, active/new status, no contact > 7 days)
      if (cleanVal >= 10000 && (cat(status) === "open" || cat(status) === "in_progress") && daysInactiveMs > sevenDaysMs) {
        highValueAtRiskCount++;
      }

      // Rule 3: Unassigned New Leads
      if (cat(status) === "open" && !l.ownerId) {
        unassignedNewCount++;
      }

      // Rule 4: Stale High Priority (Priority High, active, inactive > 7 days)
      if (l.priority === "high" && (cat(status) === "in_progress" || cat(status) === "open") && daysInactiveMs > sevenDaysMs) {
        staleHighPriorityCount++;
      }
    }

    return [
      {
        key: "hot_leads",
        title: "Hot & Highly Engaged",
        description: "Leads with score >= 70 contacted within the last 3 days",
        count: hotCount,
      },
      {
        key: "high_value_at_risk",
        title: "High Value Deals At Risk",
        description: "Deals value >= $10,000 without contact for over 7 days",
        count: highValueAtRiskCount,
      },
      {
        key: "unassigned_new",
        title: "Unassigned New Leads",
        description: "New incoming leads without an assigned sales owner",
        count: unassignedNewCount,
      },
      {
        key: "stale_high_priority",
        title: "Stale High Priority Leads",
        description: "High priority active leads with no contact for over 7 days",
        count: staleHighPriorityCount,
      },
    ];
  }
}
