import { eventBus, EventPayload } from "./emitter";
import { db } from "@/db";
import { automations, automationTriggers, leads } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { automationQueue } from "@/lib/jobs/workers/automationWorker";
import { enrichmentQueue } from "@/lib/jobs/workers/enrichmentWorker";

async function dispatchTrigger(eventType: string, payload: EventPayload) {
  if (!payload.leadId) return;

  // The lead is the tenancy source of truth — only automations of the lead's own org may fire.
  const [lead] = await db
    .select({ organizationId: leads.organizationId })
    .from(leads)
    .where(eq(leads.id, payload.leadId))
    .limit(1);
  if (!lead) return;

  // Find active automations of this org listening to this trigger type.
  const activeTriggers = await db
    .select({
      automationId: automationTriggers.automationId,
    })
    .from(automationTriggers)
    .innerJoin(automations, eq(automationTriggers.automationId, automations.id))
    .where(
      and(
        eq(automations.isActive, true),
        eq(automationTriggers.type, eventType),
        eq(automations.organizationId, lead.organizationId)
      )
    );

  for (const trigger of activeTriggers) {
    const idempotencyKey = `${trigger.automationId}-${payload.leadId}-${eventType}`;

    // jobId = idempotencyKey: BullMQ drops a duplicate enqueue of the same (automation, lead, event),
    // so an automation runs at most once per lead per trigger even if the event double-fires.
    await automationQueue.add(`auto-${idempotencyKey}`, {
      automationId: trigger.automationId,
      leadId: payload.leadId,
      triggerType: eventType,
      idempotencyKey,
      payload,
    }, { jobId: idempotencyKey });
  }
}

import { ActivityService } from "@/domains/activities/service";
import { NotificationService } from "@/domains/notifications/service";
import { LeadService } from "@/domains/leads/service";
import { WebhookEndpointService } from "@/domains/integrations/webhookEndpointService";

const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Fire an outbound webhook for a lead event to any org endpoint subscribed to it. Best-effort.
async function fireLeadWebhook(leadId: string, event: "lead.created" | "lead.status_changed", extra: Record<string, any> = {}) {
  const lead = await LeadService.getLeadById(leadId);
  if (!lead?.organizationId) return;
  await WebhookEndpointService.dispatch(lead.organizationId, event, {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    status: lead.status,
    ...extra,
  });
}

// Bind events to the dispatcher and activity logger — exactly once per process, even if
// this module is evaluated in more than one bundle.
const __handlerGuard = globalThis as unknown as { __eventHandlersBound?: boolean };
if (!__handlerGuard.__eventHandlersBound) {
  __handlerGuard.__eventHandlersBound = true;

eventBus.on('lead.created', async (p) => {
  dispatchTrigger('lead.created', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: isUuid(p.userId) ? p.userId : undefined, type: 'note', content: 'Lead was created manually.' });
  await fireLeadWebhook(p.leadId, 'lead.created');
  // Meta CAPI: report the lead capture so ad campaigns can optimise (no-op unless configured).
  const { MetaCapiService } = await import("@/domains/leads/metaCapiService");
  await MetaCapiService.track(p.leadId, 'Lead');
  // Enrich in the background (no-op when no provider is configured). jobId = leadId dedupes a
  // double-fire, and the worker itself is a no-op if enrichment is off, so this is always safe.
  await enrichmentQueue.add(`enrich-${p.leadId}`, { leadId: p.leadId }, { jobId: `enrich-${p.leadId}` });
});

eventBus.on('lead.updated', async (p) => {
  dispatchTrigger('lead.updated', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: isUuid(p.userId) ? p.userId : undefined, type: 'note', content: 'Lead details were updated.' });
});

eventBus.on('lead.assigned', async (p) => {
  dispatchTrigger('lead.assigned', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: isUuid(p.assignedById) ? p.assignedById : undefined, type: 'note', content: `Lead was assigned to user ${p.ownerId}.` });

  // The "New Lead Alert": ping the owner, unless they assigned it to themselves.
  if (p.ownerId && p.ownerId !== p.assignedById) {
    const lead = await LeadService.getLeadById(p.leadId);
    await NotificationService.create({
      userId: p.ownerId,
      type: 'new_lead',
      title: `New lead: ${lead?.name ?? 'Unknown'}`,
      body: lead?.phone || lead?.email || undefined,
      leadId: p.leadId,
    });
  }
});

eventBus.on('lead.status_changed', async (p) => {
  dispatchTrigger('lead.status_changed', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `Status changed from ${p.oldStatus} to ${p.newStatus}.` });
  await fireLeadWebhook(p.leadId, 'lead.status_changed', { oldStatus: p.oldStatus, newStatus: p.newStatus });
  const { MetaCapiService, metaEventForStatus } = await import("@/domains/leads/metaCapiService");
  // Meta CAPI: a won lead is the conversion worth optimising toward (hashed-PII event).
  if (p.newStatus === 'won') {
    await MetaCapiService.track(p.leadId, 'Purchase');
  }
  // Conversion Leads postback: report the CRM stage back to Meta by leadgen id, so ad delivery
  // optimises toward leads that actually progress. No-op for non-Meta leads / unconfigured tenants.
  const stageEvent = metaEventForStatus(p.newStatus);
  if (stageEvent) {
    await MetaCapiService.trackCrmStage(p.leadId, stageEvent);
  }
});

eventBus.on('lead.stage_changed', (p) => dispatchTrigger('lead.stage_changed', p));
eventBus.on('lead.tag_added', (p) => dispatchTrigger('lead.tag_added', p));
eventBus.on('follow_up.overdue', (p) => dispatchTrigger('follow_up.overdue', p));

eventBus.on('follow_up.scheduled', async (p) => {
  dispatchTrigger('follow_up.scheduled', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `${p.type === 'task' ? 'Task' : 'Follow-up'} scheduled: ${p.title}` });
});

eventBus.on('follow_up.completed', async (p) => {
  dispatchTrigger('follow_up.completed', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `${p.type === 'task' ? 'Task' : 'Follow-up'} completed: ${p.title}` });
});

eventBus.on('follow_up.rescheduled', async (p) => {
  dispatchTrigger('follow_up.rescheduled', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `${p.type === 'task' ? 'Task' : 'Follow-up'} rescheduled: ${p.title}` });
});

eventBus.on('task.completed', async (p) => {
  dispatchTrigger('task.completed', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `Task completed: ${p.title}` });
});

}
