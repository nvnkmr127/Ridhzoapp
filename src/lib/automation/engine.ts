import { db } from "@/db";
import { automationConditions, automationActions, leads, users } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { FollowUpService } from "@/domains/follow-ups/service";
import { ActivityService } from "@/domains/activities/service";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { EventPayload } from "@/lib/events/emitter";

import { AssignmentService } from "@/domains/leads/assignmentService";
import { evaluateConditionGroup } from "@/lib/leads/conditions";

// Resolve a follow-up/task due time from an action config. Relative offsets are computed now (so a
// saved automation stays correct for every future lead); an absolute `dueAt` is an explicit override.
export function resolveDueAt(config: any): Date | null {
  const now = Date.now();
  if (config.dueInMinutes != null) return new Date(now + Number(config.dueInMinutes) * 60_000);
  if (config.dueInHours != null) return new Date(now + Number(config.dueInHours) * 3_600_000);
  if (config.dueInDays != null) return new Date(now + Number(config.dueInDays) * 86_400_000);
  if (config.dueAt) { const d = new Date(config.dueAt); return isNaN(d.getTime()) ? null : d; }
  return null;
}

export class AutomationEngine {
  static async evaluateAndExecute(automationId: string, leadId: string, payload?: EventPayload) {
    // 1. Evaluate Conditions
    const conditionsData = await db
      .select()
      .from(automationConditions)
      .where(eq(automationConditions.automationId, automationId));

    if (conditionsData.length > 0) {
      const [leadRow] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!leadRow) throw new Error(`Lead ${leadId} not found for condition evaluation`);

      const config = conditionsData[0].config as any;
      if (config && Object.keys(config).length > 0) {
        // Attach tags so `tag` conditions can match (evaluator reads lead.tag as a comma string).
        const { TagService } = await import("@/domains/tags/service");
        const tags = await TagService.getForLead(leadId).catch(() => [] as { name: string }[]);
        const tagStr = tags.map((t) => t.name).join(", ");
        const lead = { ...leadRow, tag: tagStr, tags: tagStr };
        const passed = this.evaluateConditionGroup(lead, config);
        if (!passed) {
          return { skipped: true, executedCount: 0 };
        }
      }
    }

    // 2. Execute Actions Sequentially
    const actions = await db
      .select()
      .from(automationActions)
      .where(eq(automationActions.automationId, automationId))
      .orderBy(asc(automationActions.orderIndex));

    // Best-effort: one action failing (e.g. WhatsApp with no BSP) must not abort the rest, so a
    // "welcome WhatsApp → enroll in sequence" automation still enrolls even if the WhatsApp step
    // can't send. Only throw (→ job retry) when EVERY action failed; a partial success completes.
    let executedCount = 0;
    const failures: string[] = [];
    for (const action of actions) {
      try {
        await this.executeAction(leadId, action.type, action.config as any, payload);
        executedCount++;
      } catch (error) {
        failures.push(`${action.type}: ${(error as Error).message}`);
      }
    }

    if (actions.length > 0 && executedCount === 0) {
      throw new Error(`All actions failed — ${failures.join("; ")}`);
    }

    return { skipped: false, executedCount, failures };
  }

  // Condition matching lives in one shared, pure module (also used by lead-distribution rules).
  private static evaluateConditionGroup(lead: any, group: any): boolean {
    return evaluateConditionGroup(lead, group);
  }

  private static async executeAction(leadId: string, type: string, config: any, payload?: EventPayload) {
    const rawUserId = payload?.userId || payload?.ownerId;
    const isUuid = (str?: string | null): str is string =>
      Boolean(str && typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    let actorUserId: string | undefined = isUuid(rawUserId) ? rawUserId : undefined;

    // Fall back to lead owner if payload has no user ID
    if (!actorUserId) {
      const [lead] = await db.select({ ownerId: leads.ownerId }).from(leads).where(eq(leads.id, leadId)).limit(1);
      if (lead && isUuid(lead.ownerId)) {
        actorUserId = lead.ownerId;
      }
    }

    switch (type) {
      case 'assign_lead':
        if (!config.userId) throw new Error("Missing userId for assign_lead");
        await AssignmentService.assignLead({
          leadId,
          ownerId: config.userId,
          assignedById: actorUserId ?? "automation",
          source: "automation",
        });
        break;

      case 'assign_round_robin': {
        // Load-balanced assignment across the org's available reps (highest remaining capacity).
        const [lead] = await db.select({ organizationId: leads.organizationId }).from(leads).where(eq(leads.id, leadId)).limit(1);
        if (!lead?.organizationId) throw new Error("Lead has no organization for assignment");
        const { CapacityAssignmentService } = await import("@/domains/leads/capacityAssignmentService");
        await CapacityAssignmentService.assignLeadWithCapacity({
          leadId,
          organizationId: lead.organizationId,
          assignedById: actorUserId ?? "automation",
          maxCapacity: config.maxCapacity ? Number(config.maxCapacity) || undefined : undefined,
        });
        break;
      }

      case 'change_status':
        if (!config.status) throw new Error("Missing status for change_status");
        await LeadService.changeStatus(leadId, config.status, actorUserId, undefined, undefined, "automation");
        break;

      case 'create_task':
      case 'schedule_follow_up': {
        if (!config.title) throw new Error(`Missing title for ${type}`);
        // Relative offset computed at run time (dueInDays/Hours/Minutes) — falls back to an absolute
        // dueAt override. A fixed dueAt in a saved automation would go stale for later leads.
        const dueAt = resolveDueAt(config);
        if (!dueAt) throw new Error(`Missing due time for ${type} (set dueInDays / dueInHours or an absolute dueAt)`);

        // Resolve the assignee and keep it inside the lead's org (defense against a crafted config).
        const [lead] = await db.select({ organizationId: leads.organizationId, ownerId: leads.ownerId }).from(leads).where(eq(leads.id, leadId)).limit(1);
        if (!lead?.organizationId) throw new Error("Lead has no organization");
        let assignedUser = isUuid(config.userId) ? config.userId : actorUserId;
        if (assignedUser) {
          const [ok] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, assignedUser), eq(users.organizationId, lead.organizationId))).limit(1);
          if (!ok) assignedUser = isUuid(lead.ownerId) ? lead.ownerId! : undefined; // foreign/invalid → lead owner
        }
        if (!assignedUser) throw new Error(`Cannot create ${type}: no valid in-org user to assign to`);

        await FollowUpService.createFollowUp({
          leadId,
          type: type === 'create_task' ? 'task' : 'follow_up',
          title: config.title,
          description: config.description,
          dueAt,
          userId: assignedUser,
          organizationId: lead.organizationId,
        });
        break;
      }

      case 'add_note':
        if (!config.content) throw new Error("Missing content for add_note");
        await ActivityService.addActivity({
          leadId,
          userId: actorUserId,
          type: 'note',
          content: config.content,
        });
        break;

      case 'enroll_in_sequence':
        if (!config.sequenceId) throw new Error("Missing sequenceId for enroll_in_sequence");
        const { SequenceService } = await import("@/domains/leads/sequenceService");
        await SequenceService.enrollFromAutomation(config.sequenceId, leadId);
        break;

      case 'send_whatsapp':
        // Instant-reply to a fresh lead: outside the 24h window, so a template is required.
        if (!config.templateName) throw new Error("Missing templateName for send_whatsapp");
        await WhatsAppService.send({
          leadId,
          userId: actorUserId,
          templateName: config.templateName,
          variables: config.variables,
        });
        break;

      default:
        throw new Error(`Unsupported action type: ${type}`);
    }
  }
}
