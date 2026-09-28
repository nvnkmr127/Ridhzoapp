import { db } from "@/db";
import { CustomStatusSchemaService } from "./customStatusSchemaService";
import { leads } from "@/db/schema";
import { and, asc, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
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
  private static async staleWhere(organizationId: string, daysInactiveThreshold: number, enforceOwnerId?: string) {
    const { openKeys } = await CustomStatusSchemaService.resolver(organizationId); // custom statuses count by category
    const thresholdDate = new Date(Date.now() - daysInactiveThreshold * 24 * 60 * 60 * 1000);
    return and(
      eq(leads.organizationId, organizationId),
      isNull(leads.deletedAt),
      openKeys.length ? inArray(leads.status, openKeys) : sql`false`,
      ...(enforceOwnerId ? [eq(leads.ownerId, enforceOwnerId)] : []),
      or(
        lt(leads.lastContactedAt, thresholdDate),
        and(isNull(leads.lastContactedAt), lt(leads.createdAt, thresholdDate))
      )
    );
  }

  /**
   * Identifies leads with no contact activity exceeding the inactivity threshold, most inactive first.
   * Pass limit/offset from list screens — without them every stale lead is returned (bulk reclaim).
   */
  static async detectStaleLeads(
    organizationId: string,
    daysInactiveThreshold: number = 14,
    enforceOwnerId?: string,
    page?: { limit: number; offset?: number }
  ): Promise<StaleLeadSummary[]> {
    const where = await this.staleWhere(organizationId, daysInactiveThreshold, enforceOwnerId);
    const q = db
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
      .where(where)
      .orderBy(asc(sql`coalesce(${leads.lastContactedAt}, ${leads.createdAt})`), asc(leads.id));
    const candidates = page ? await q.limit(page.limit).offset(page.offset ?? 0) : await q;

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

  static async countStaleLeads(organizationId: string, daysInactiveThreshold: number = 14, enforceOwnerId?: string): Promise<number> {
    const where = await this.staleWhere(organizationId, daysInactiveThreshold, enforceOwnerId);
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where);
    return Number(row?.n ?? 0);
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
