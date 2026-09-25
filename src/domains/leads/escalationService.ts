import { db } from "@/db";
import { leads, organizations } from "@/db/schema";
import { and, eq, gte, isNull, isNotNull, lt, inArray } from "drizzle-orm";
import { NotificationService } from "@/domains/notifications/service";
import { AuditService } from "@/domains/audit/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { isWorkingTime } from "@/lib/workHours";

// Escalates leads that have sat in "new" past the org's SLA window. Idempotent per lead via
// leads.escalatedAt, so re-running the scan never double-alerts.
export class EscalationService {
  static async runForOrg(organizationId: string): Promise<number> {
    const [org] = await db
      .select({
        slaHours: organizations.slaHours, timezone: organizations.timezone,
        workDays: organizations.workDays, workStartHour: organizations.workStartHour, workEndHour: organizations.workEndHour,
      })
      .from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    const hours = org?.slaHours;
    if (!hours || hours <= 0) return 0;
    // Closed (night, day off): hold the alert. Leads stay un-stamped, so they alert at opening time.
    if (!isWorkingTime(new Date(), org.timezone, org)) return 0;

    // Escalate any unactioned lead still in an OPEN-category status — not just the literal "new".
    // A tenant that renamed its intake stage or uses a custom open status must still get SLA alerts.
    const categoryMap = await CustomStatusSchemaService.getStatusCategoryMap(organizationId);
    const openStatuses = [...categoryMap.entries()].filter(([, c]) => c === "open").map(([k]) => k);
    if (openStatuses.length === 0) return 0;

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    // Only recent leads: turning the alert on (or shortening it) must not blast one push per old
    // lead in the backlog — those belong to the morning summary's "not contacted" count.
    const lookback = new Date(cutoff.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stale = await db
      .select({ id: leads.id, name: leads.name, ownerId: leads.ownerId })
      .from(leads)
      .where(and(
        eq(leads.organizationId, organizationId),
        inArray(leads.status, openStatuses),
        isNull(leads.escalatedAt),
        isNull(leads.deletedAt),
        // "Not contacted" means no call/WhatsApp/email logged — owners often reply without moving
        // the stage off "New", and alerting on those leads is noise.
        isNull(leads.firstContactedAt),
        lt(leads.createdAt, cutoff),
        gte(leads.createdAt, lookback),
      ));

    for (const lead of stale) {
      await db.update(leads).set({ escalatedAt: new Date() }).where(eq(leads.id, lead.id));
      if (lead.ownerId) {
        await NotificationService.create({
          userId: lead.ownerId,
          type: "sla_escalation",
          title: "Lead not contacted yet",
          body: "{name} has been waiting over {hours}h. Reply now before they go cold.",
          bodyVars: { name: lead.name, hours },
          leadId: lead.id,
        });
      } else {
        // Unassigned overdue leads are exactly the ones most at risk of being dropped — alert the
        // account's admins to triage, instead of silently stamping escalatedAt and moving on.
        await NotificationService.notifyOrgAdmins(organizationId, {
          type: "sla_escalation",
          title: "Unassigned lead not contacted",
          body: "{name} has been waiting over {hours}h and nobody owns it. Assign it now.",
          bodyVars: { name: lead.name, hours },
          leadId: lead.id,
        });
      }
    }
    // One row per org per scan, not per lead — a busy org with a short SLA can otherwise write
    // one audit row per stale lead every 15 minutes and flood the org's own audit page (each lead
    // still gets its own notification and its `escalatedAt` stamp; only the audit fan-out changes).
    if (stale.length > 0) {
      await AuditService.log({
        organizationId,
        action: "lead.sla_escalated",
        entityType: "organization",
        entityId: organizationId,
        metadata: { hours, count: stale.length, sampleLeadIds: stale.slice(0, 50).map((l) => l.id) },
      });
    }
    return stale.length;
  }

  // Sweep every org that has an SLA configured. Call this from a periodic worker job.
  static async runAll(): Promise<number> {
    const orgs = await db.select({ id: organizations.id }).from(organizations).where(isNotNull(organizations.slaHours));
    let total = 0;
    for (const o of orgs) total += await this.runForOrg(o.id);
    return total;
  }
}
