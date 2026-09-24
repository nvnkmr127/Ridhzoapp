import { db } from "@/db";
import { leads, users } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export interface AnalyticsLeadRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: string;
  expectedValue: string | null;
  lostReason: string | null;
  sourceId: string | null;
  ownerId: string | null;
  stageId: string | null;
  customData: unknown;
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
}

export interface AnalyticsUserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export class AnalyticsCoordinator {
  /**
   * Fetches the tenant's non-deleted leads dataset in ONE single SQL query.
   * This dataset is shared across analytics services that evaluate lead-level
   * attributes (forecast, win/loss, source ROI, health, qualification, aging,
   * cohorts, LTV, geo, SLA).
   */
  static async getTenantLeads(organizationId: string): Promise<AnalyticsLeadRecord[]> {
    return db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        company: leads.company,
        status: leads.status,
        expectedValue: leads.expectedValue,
        lostReason: leads.lostReason,
        sourceId: leads.sourceId,
        ownerId: leads.ownerId,
        stageId: leads.stageId,
        // Drop the bulky per-lead AI recap + score evidence — no report reads them, and on large
        // workspaces they dominated this admin-only full-tenant load.
        customData: sql<unknown>`${leads.customData} - '_aiRecap' - '_scoreFactors'`,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        lastContactedAt: leads.lastContactedAt,
        nextFollowUpAt: leads.nextFollowUpAt,
      })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));
  }

  /**
   * Fetches active tenant users in ONE single SQL query.
   */
  static async getTenantUsers(organizationId: string): Promise<AnalyticsUserRecord[]> {
    return db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true)));
  }
}
