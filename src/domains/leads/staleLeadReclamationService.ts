import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray, lt, or, isNull } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";

export interface StaleLeadSummary {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  email: string | null;
  lastContactedAt: Date | null;
  createdAt: Date;
  daysInactive: number;
}

export class StaleLeadReclamationService {
  /**
   * Identifies leads with no contact activity exceeding the inactivity threshold.
   */
  static async detectStaleLeads(
    organizationId: string,
    daysInactiveThreshold: number = 14,
    enforceOwnerId?: string
  ): Promise<StaleLeadSummary[]> {
    const thresholdDate = new Date(Date.now() - daysInactiveThreshold * 24 * 60 * 60 * 1000);

    const candidates = await db
      .select({
        id: leads.id,
        name: leads.name,
        status: leads.status,
        phone: leads.phone,
        email: leads.email,
        lastContactedAt: leads.lastContactedAt,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, organizationId),
          isNull(leads.deletedAt),
          inArray(leads.status, ["new", "active"]),
          ...(enforceOwnerId ? [eq(leads.ownerId, enforceOwnerId)] : []),
          or(
            lt(leads.lastContactedAt, thresholdDate),
            and(isNull(leads.lastContactedAt), lt(leads.createdAt, thresholdDate))
          )
        )
      );

    const now = Date.now();
    return candidates.map((c) => {
      const refTime = c.lastContactedAt ? new Date(c.lastContactedAt).getTime() : new Date(c.createdAt).getTime();
      const daysInactive = Math.floor((now - refTime) / (1000 * 60 * 60 * 24));
      return {
        ...c,
        daysInactive,
      };
    });
  }

  /**
   * Reclaims stale leads by setting priority to 'high' and logging re-engagement tasks.
   */
  static async reclaimStaleLeads(
    organizationId: string,
    daysInactiveThreshold: number = 14,
    actorUserId?: string,
    enforceOwnerId?: string
  ): Promise<{ reclaimedCount: number; leadIds: string[] }> {
    const staleLeads = await this.detectStaleLeads(organizationId, daysInactiveThreshold, enforceOwnerId);
    if (staleLeads.length === 0) return { reclaimedCount: 0, leadIds: [] };

    const staleIds = staleLeads.map((l) => l.id);

    // Update priority to high
    await db
      .update(leads)
      .set({ priority: "high", updatedAt: new Date() })
      .where(inArray(leads.id, staleIds));

    // Add activity log for each reclaimed lead
    for (const l of staleLeads) {
      await ActivityService.addActivity({
        leadId: l.id,
        userId: actorUserId,
        type: "note",
        content: `Lead flagged as stale (${l.daysInactive} days inactive). Priority escalated to High for immediate re-engagement.`,
      });
    }

    return { reclaimedCount: staleIds.length, leadIds: staleIds };
  }
}
