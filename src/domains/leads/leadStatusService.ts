import { db } from "@/db";
import { leads, leadStatusHistory, users } from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";

export type LeadStatus = "new" | "active" | "won" | "lost" | "unqualified";

export const ALLOWED_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["active", "unqualified", "lost"],
  active: ["won", "lost", "unqualified"],
  won: ["active"], // Re-opened deal
  lost: ["active"], // Re-opened deal
  unqualified: ["active", "new"], // Re-evaluated deal
};

export interface StatusHistoryEntry {
  id: string;
  leadId: string;
  oldStatus: string | null;
  newStatus: string;
  changedById: string | null;
  changedByName: string | null;
  createdAt: Date;
  durationInPreviousStatusHours: number | null;
}

export interface StatusDurationMetric {
  status: LeadStatus;
  leadCount: number;
  averageDurationHours: number;
  medianDurationHours: number;
}

export class LeadStatusService {
  /**
   * Validates if a transition from currentStatus to desired newStatus is allowed.
   */
  static isValidTransition(currentStatus: string, newStatus: string): boolean {
    if (currentStatus === newStatus) return true;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus as LeadStatus];
    return allowed ? allowed.includes(newStatus as LeadStatus) : true;
  }

  /**
   * Updates status for a single lead with tenant validation and status history tracking.
   */
  static async changeStatus(
    leadId: string,
    newStatus: LeadStatus,
    changedById: string,
    organizationId: string
  ) {
    const [currentLead] = await db
      .select({ status: leads.status, organizationId: leads.organizationId })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .limit(1);

    if (!currentLead) {
      throw new Error("Lead not found or unauthorized");
    }

    if (currentLead.status === newStatus) {
      return currentLead;
    }

    if (!this.isValidTransition(currentLead.status, newStatus)) {
      throw new Error(`Invalid status transition from '${currentLead.status}' to '${newStatus}'`);
    }

    const [updatedLead] = await db
      .update(leads)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .returning();

    await db.insert(leadStatusHistory).values({
      leadId,
      oldStatus: currentLead.status,
      newStatus,
      changedById,
    });

    eventBus.emit("lead.status_changed", {
      leadId,
      oldStatus: currentLead.status,
      newStatus,
      userId: changedById,
    });

    return updatedLead;
  }

  // NOTE: bulk status changes route through LeadService.changeStatus (the single canonical status
  // engine) so won/lost bookkeeping and custom-status categories always apply. A second bulk engine
  // used to live here but diverged (it skipped won_at / loss-reason / follow-up cancellation), so it
  // was removed. See lib/actions/customStatuses.ts and lib/actions/leads.ts.

  /**
   * Gets chronological status audit history for a lead with transition time calculations.
   */
  static async getStatusHistory(leadId: string, organizationId: string): Promise<StatusHistoryEntry[]> {
    // Verify lead ownership/tenant
    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .limit(1);

    if (!lead) {
      throw new Error("Lead not found or unauthorized");
    }

    const history = await db
      .select({
        id: leadStatusHistory.id,
        leadId: leadStatusHistory.leadId,
        oldStatus: leadStatusHistory.oldStatus,
        newStatus: leadStatusHistory.newStatus,
        changedById: leadStatusHistory.changedById,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        createdAt: leadStatusHistory.createdAt,
      })
      .from(leadStatusHistory)
      .leftJoin(users, eq(leadStatusHistory.changedById, users.id))
      .where(eq(leadStatusHistory.leadId, leadId))
      .orderBy(desc(leadStatusHistory.createdAt));

    const entries: StatusHistoryEntry[] = [];
    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const prev = history[i + 1];

      let durationInPreviousStatusHours: number | null = null;
      if (prev) {
        const diffMs = new Date(current.createdAt).getTime() - new Date(prev.createdAt).getTime();
        durationInPreviousStatusHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
      }

      const nameParts = [current.userFirstName, current.userLastName].filter(Boolean);
      const changedByName = nameParts.length > 0 ? nameParts.join(" ") : current.userEmail ?? null;

      entries.push({
        id: current.id,
        leadId: current.leadId,
        oldStatus: current.oldStatus,
        newStatus: current.newStatus,
        changedById: current.changedById,
        changedByName,
        createdAt: current.createdAt,
        durationInPreviousStatusHours,
      });
    }

    return entries;
  }

  /**
   * Calculates organization-wide average duration leads spend in each status state.
   */
  static async getStatusDurationAnalytics(organizationId: string): Promise<StatusDurationMetric[]> {
    const orgLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));

    if (orgLeads.length === 0) {
      return [
        { status: "new", leadCount: 0, averageDurationHours: 0, medianDurationHours: 0 },
        { status: "active", leadCount: 0, averageDurationHours: 0, medianDurationHours: 0 },
        { status: "won", leadCount: 0, averageDurationHours: 0, medianDurationHours: 0 },
        { status: "lost", leadCount: 0, averageDurationHours: 0, medianDurationHours: 0 },
        { status: "unqualified", leadCount: 0, averageDurationHours: 0, medianDurationHours: 0 },
      ];
    }

    const leadIds = orgLeads.map((l) => l.id);

    const histories = await db
      .select({
        leadId: leadStatusHistory.leadId,
        oldStatus: leadStatusHistory.oldStatus,
        newStatus: leadStatusHistory.newStatus,
        createdAt: leadStatusHistory.createdAt,
      })
      .from(leadStatusHistory)
      .where(inArray(leadStatusHistory.leadId, leadIds))
      .orderBy(leadStatusHistory.createdAt);

    const durationsByStatus: Record<string, number[]> = {
      new: [],
      active: [],
      won: [],
      lost: [],
      unqualified: [],
    };

    const leadHistories: Record<string, typeof histories> = {};
    for (const h of histories) {
      if (!leadHistories[h.leadId]) leadHistories[h.leadId] = [];
      leadHistories[h.leadId].push(h);
    }

    for (const leadId of Object.keys(leadHistories)) {
      const items = leadHistories[leadId];
      for (let i = 0; i < items.length - 1; i++) {
        const current = items[i];
        const next = items[i + 1];
        const status = current.newStatus;

        if (durationsByStatus[status]) {
          const diffHours = (new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime()) / (1000 * 60 * 60);
          durationsByStatus[status].push(diffHours);
        }
      }
    }

    const metrics: StatusDurationMetric[] = [];
    const statuses: LeadStatus[] = ["new", "active", "won", "lost", "unqualified"];

    for (const status of statuses) {
      const arr = durationsByStatus[status] || [];
      if (arr.length === 0) {
        metrics.push({ status, leadCount: 0, averageDurationHours: 0, medianDurationHours: 0 });
      } else {
        const sum = arr.reduce((acc, v) => acc + v, 0);
        const avg = Math.round((sum / arr.length) * 10) / 10;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

        metrics.push({
          status,
          leadCount: arr.length,
          averageDurationHours: avg,
          medianDurationHours: Math.round(median * 10) / 10,
        });
      }
    }

    return metrics;
  }
}
