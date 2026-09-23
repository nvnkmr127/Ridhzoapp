import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray, lt } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";

export type StagnationRisk = "medium" | "high" | "critical";

export interface StagnantLeadSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  stageId: string | null;
  ownerId: string | null;
  daysStagnant: number;
  riskLevel: StagnationRisk;
  updatedAt: Date;
}

export class StageStagnationService {
  /**
   * Detects leads stagnating in their current pipeline stage beyond specified threshold days.
   */
  static async getStagnantLeads(
    organizationId: string,
    daysThreshold: number = 10,
    preloadedLeads?: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      status: string;
      stageId: string | null;
      ownerId: string | null;
      updatedAt: Date;
    }[]
  ): Promise<StagnantLeadSummary[]> {
    const thresholdDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

    const candidates = preloadedLeads
      ? preloadedLeads.filter(
          (l) =>
            l.status &&
            ["new", "active"].includes(l.status) &&
            new Date(l.updatedAt) < thresholdDate
        )
      : await db
          .select({
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            email: leads.email,
            status: leads.status,
            stageId: leads.stageId,
            ownerId: leads.ownerId,
            updatedAt: leads.updatedAt,
          })
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, organizationId),
              inArray(leads.status, ["new", "active"]),
              lt(leads.updatedAt, thresholdDate)
            )
          );

    const nowMs = Date.now();

    const results: StagnantLeadSummary[] = candidates.map((c) => {
      const updatedMs = new Date(c.updatedAt).getTime();
      const daysStagnant = Math.floor((nowMs - updatedMs) / (1000 * 60 * 60 * 24));

      let riskLevel: StagnationRisk = "medium";
      if (daysStagnant >= 21) {
        riskLevel = "critical";
      } else if (daysStagnant >= 14) {
        riskLevel = "high";
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        status: c.status,
        stageId: c.stageId,
        ownerId: c.ownerId,
        daysStagnant,
        riskLevel,
        updatedAt: new Date(c.updatedAt),
      };
    });

    results.sort((a, b) => b.daysStagnant - a.daysStagnant);
    return results;
  }

  /**
   * Flags stagnant leads in activity logs to prompt immediate sales rep deal progression.
   */
  static async flagStagnantLeads(
    organizationId: string,
    daysThreshold: number = 10,
    actorUserId?: string
  ): Promise<{ flaggedCount: number; leadIds: string[] }> {
    const stagnant = await this.getStagnantLeads(organizationId, daysThreshold);
    if (stagnant.length === 0) return { flaggedCount: 0, leadIds: [] };

    const leadIds = stagnant.map((l) => l.id);

    for (const l of stagnant) {
      await ActivityService.addActivity({
        leadId: l.id,
        userId: actorUserId,
        type: "note",
        content: `PIPELINE ALERT: Lead has been stagnant in '${l.status}' stage for ${l.daysStagnant} days (Risk level: ${l.riskLevel.toUpperCase()}). Please advance stage or close deal.`,
      });
    }

    return { flaggedCount: leadIds.length, leadIds };
  }
}
