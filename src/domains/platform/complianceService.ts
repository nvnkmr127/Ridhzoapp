import { db } from "@/db";
import { leads, organizations, activities, followUps, users } from "@/db/schema";
import { eq, or, ilike, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { AuditService } from "@/domains/audit/service";
import { OpsAlertService } from "./opsAlertService";
import { PlatformConfigService } from "./configService";
import { sendEmail } from "@/lib/mail/mailer";

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
  // ponytail: fixed 180d retention, make per-plan if legal asks.
  static readonly RETENTION_DAYS = 180;
  static readonly RETENTION_WARN_DAYS = 166; // 14 days before 180d purge

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

  static async anonymizeTenant(organizationId: string, actorId: string = "system"): Promise<{ anonymizedLeads: number }> {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) return { anonymizedLeads: 0 };

    const orgLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.organizationId, organizationId));
    const leadIds = orgLeads.map((l) => l.id);

    if (leadIds.length > 0) {
      await db
        .update(leads)
        .set({
          name: "[REDACTED_RETENTION]",
          phone: null,
          email: null,
          company: null,
          customData: {},
          updatedAt: new Date(),
        })
        .where(eq(leads.organizationId, organizationId));

      await db
        .update(activities)
        .set({
          content: "[Redacted per Compliance Auto-Retention Policy]",
          updatedAt: new Date(),
        })
        .where(inArray(activities.leadId, leadIds));

      await db
        .update(followUps)
        .set({
          title: "[Redacted]",
          description: null,
          updatedAt: new Date(),
        })
        .where(inArray(followUps.leadId, leadIds));
    }

    await db
      .update(users)
      .set({
        phone: null,
        updatedAt: new Date(),
      })
      .where(and(eq(users.organizationId, organizationId), eq(users.isSuperAdmin, false)));

    await AuditService.log({
      organizationId,
      userId: actorId === "system" ? "00000000-0000-0000-0000-000000000000" : actorId,
      action: "compliance.tenant_retention_anonymize",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        orgName: org.name,
        slug: org.slug,
        leadCount: leadIds.length,
        standard: "Auto-retention 180d policy",
      },
    });

    await OpsAlertService.dispatchAlert(
      "compliance.retention_purged",
      "Suspended Tenant Data Anonymized",
      `Customer PII across ${leadIds.length} leads for suspended tenant "${org.name}" (${org.slug}) was permanently anonymized under the 180-day retention policy.`
    );

    return { anonymizedLeads: leadIds.length };
  }

  static async processSuspensionRetention(now: Date = new Date()): Promise<{
    scannedCount: number;
    warnedCount: number;
    anonymizedCount: number;
  }> {
    const suspended = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        suspendedAt: organizations.suspendedAt,
      })
      .from(organizations)
      .where(isNotNull(organizations.suspendedAt));

    let warnedCount = 0;
    let anonymizedCount = 0;

    for (const org of suspended) {
      if (!org.suspendedAt) continue;

      const suspendedMs = now.getTime() - new Date(org.suspendedAt).getTime();
      const daysSuspended = Math.floor(suspendedMs / (1000 * 60 * 60 * 24));
      const stateKey = `retention_state:${org.id}`;
      const state = await PlatformConfigService.get<{ warnedAt?: string; anonymizedAt?: string }>(stateKey, {});

      // Case 1: Suspended >= 180 days -> Anonymize
      if (daysSuspended >= ComplianceService.RETENTION_DAYS) {
        if (!state.anonymizedAt) {
          await ComplianceService.anonymizeTenant(org.id, "system-retention-worker");
          await PlatformConfigService.set(stateKey, { ...state, anonymizedAt: now.toISOString() });
          anonymizedCount++;
        }
      }
      // Case 2: Suspended >= 166 days (14 days before purge) -> Warn owner
      else if (daysSuspended >= ComplianceService.RETENTION_WARN_DAYS) {
        if (!state.warnedAt) {
          const [owner] = await db
            .select({ email: users.email, firstName: users.firstName })
            .from(users)
            .where(and(eq(users.organizationId, org.id), eq(users.isActive, true)))
            .limit(1);

          if (owner?.email) {
            const daysLeft = Math.max(1, ComplianceService.RETENTION_DAYS - daysSuspended);
            await sendEmail({
              to: owner.email,
              subject: `[Compliance Notice] Data retention expiry for ${org.name}`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                  <h2 style="color: #b91c1c; margin-top: 0;">Data Retention Expiry Notice</h2>
                  <p>Hello ${owner.firstName || "there"},</p>
                  <p>Your organization <strong>${org.name}</strong> (${org.slug}) has been suspended for ${daysSuspended} days.</p>
                  <p>Under our compliance data retention policy, all customer records and personal data will be permanently anonymized in <strong>${daysLeft} days</strong>.</p>
                  <p>If you wish to reactivate your account or export your data before it is anonymized, please contact support immediately.</p>
                </div>
              `,
            });
          }

          await PlatformConfigService.set(stateKey, { ...state, warnedAt: now.toISOString() });
          await AuditService.log({
            organizationId: org.id,
            userId: "00000000-0000-0000-0000-000000000000",
            action: "compliance.retention_warning_sent",
            entityType: "organization",
            entityId: org.id,
            metadata: { daysSuspended, recipient: owner?.email ?? null },
          });
          warnedCount++;
        }
      }
    }

    return { scannedCount: suspended.length, warnedCount, anonymizedCount };
  }
}

