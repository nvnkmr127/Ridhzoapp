import { db } from "@/db";
import { automationConditions, automationActions, leads } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { FollowUpService } from "@/domains/follow-ups/service";
import { ActivityService } from "@/domains/activities/service";
import { WhatsAppService } from "@/lib/messaging/whatsapp/service";
import { EventPayload } from "@/lib/events/emitter";

import { AssignmentService } from "@/domains/leads/assignmentService";
import { evaluateConditionGroup } from "@/lib/leads/conditions";

export class AutomationEngine {
  static async evaluateAndExecute(automationId: string, leadId: string, payload?: EventPayload) {
    // 1. Evaluate Conditions
    const conditionsData = await db
      .select()
      .from(automationConditions)
      .where(eq(automationConditions.automationId, automationId));

    if (conditionsData.length > 0) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) throw new Error(`Lead ${leadId} not found for condition evaluation`);

      const config = conditionsData[0].config as any;
      if (config && Object.keys(config).length > 0) {
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

    let executedCount = 0;
    for (const action of actions) {
      try {
        await this.executeAction(leadId, action.type, action.config as any, payload);
        executedCount++;
      } catch (error) {
        throw new Error(`Action ${action.type} failed: ${(error as Error).message}`);
      }
    }

    return { skipped: false, executedCount };
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
        });
        break;
      
      case 'change_status':
        if (!config.status) throw new Error("Missing status for change_status");
        await LeadService.changeStatus(leadId, config.status, actorUserId);
        break;

      case 'create_task':
      case 'schedule_follow_up':
        if (!config.title || !config.dueAt) throw new Error(`Missing required fields for ${type}`);
        const assignedUser = isUuid(config.userId) ? config.userId : actorUserId;
        if (!assignedUser) {
          throw new Error(`Cannot create ${type}: no valid user specified or available for assignment`);
        }
        await FollowUpService.createFollowUp({
          leadId,
          type: type === 'create_task' ? 'task' : 'follow_up',
          title: config.title,
          description: config.description,
          dueAt: new Date(config.dueAt),
          userId: assignedUser,
        });
        break;

      case 'add_note':
        if (!config.content) throw new Error("Missing content for add_note");
        await ActivityService.addActivity({
          leadId,
          userId: actorUserId,
          type: 'note',
          content: config.content,
        });
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
