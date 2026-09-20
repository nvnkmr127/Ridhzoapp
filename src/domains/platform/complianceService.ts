import { db } from "@/db";
import { leads, organizations, activities, followUps } from "@/db/schema";
import { eq, or, ilike, and, isNull } from "drizzle-orm";
import { AuditService } from "@/domains/audit/service";
import { OpsAlertService } from "./opsAlertService";

export interface SubjectMatch {
  id: string;
  organizationId: string;
  orgName: string;
  orgSlug: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: string;
  createdAt: Date;
}

export class ComplianceService {
  static async searchSubject(query: string): Promise<SubjectMatch[]> {
    const q = query.trim();
    if (!q || q.length < 3) return [];

    const rows = await db
      .select({
        id: leads.id,
        organizationId: leads.organizationId,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        company: leads.company,
        status: leads.status,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .innerJoin(organizations, eq(leads.organizationId, organizations.id))
      .where(
        and(
          isNull(leads.deletedAt),
          or(
            ilike(leads.email, `%${q}%`),
            ilike(leads.phone, `%${q}%`),
            ilike(leads.name, `%${q}%`)
          )
        )
      )
      .limit(30);

    return rows;
  }

  static async exportDsrDossier(leadId: string): Promise<Record<string, any> | null> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return null;

    const leadActivities = await db
      .select({
        type: activities.type,
        content: activities.content,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .where(eq(activities.leadId, leadId));

    const leadFollowUps = await db
      .select({
        type: followUps.type,
        title: followUps.title,
        description: followUps.description,
        status: followUps.status,
        dueAt: followUps.dueAt,
      })
      .from(followUps)
      .where(eq(followUps.leadId, leadId));

    return {
      standard: "GDPR / DPDP Article 15 - Right of Access / Data Portability",
      exportedAt: new Date().toISOString(),
      subject: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        status: lead.status,
        createdAt: lead.createdAt,
        customData: lead.customData,
      },
      activityRecords: leadActivities,
      followUpRecords: leadFollowUps,
    };
  }

  static async executeRightToBeForgotten(leadId: string, superAdminId: string): Promise<boolean> {
    const [lead] = await db
      .select({ id: leads.id, organizationId: leads.organizationId, name: leads.name })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return false;

    // 1. Redact Lead personal information (preserves aggregate reporting & conversion analytics)
    await db
      .update(leads)
      .set({
        name: "[REDACTED_GDPR]",
        phone: null,
        email: null,
        company: null,
        customData: {},
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // 2. Redact Lead activity contents
    await db
      .update(activities)
      .set({
        content: "[Redacted per GDPR Right to be Forgotten]",
        updatedAt: new Date(),
      })
      .where(eq(activities.leadId, leadId));

    // 3. Redact Followup notes
    await db
      .update(followUps)
      .set({
        title: "[Redacted]",
        description: null,
        updatedAt: new Date(),
      })
      .where(eq(followUps.leadId, leadId));

    // 4. Compliance Audit trail
    await AuditService.log({
      organizationId: lead.organizationId,
      userId: superAdminId,
      action: "compliance.gdpr_redact",
      entityType: "lead",
      entityId: leadId,
      metadata: { anonymizedSubject: lead.name, standard: "GDPR Art. 17 / DPDP" },
    });

    // 5. Notify Ops channel
    await OpsAlertService.dispatchAlert(
      "compliance.gdpr",
      "GDPR Erasure Executed",
      `Subject data for lead \`${leadId}\` was permanently anonymized across tenant \`${lead.organizationId}\`.`
    );

    return true;
  }
}
