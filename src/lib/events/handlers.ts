import { eventBus, EventPayload } from "./emitter";
import { db } from "@/db";
import { automations, automationTriggers, leads, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { automationQueue } from "@/lib/jobs/workers/automationWorker";
import { enrichmentQueue } from "@/lib/jobs/workers/enrichmentWorker";

// A per-event discriminator so a recurring trigger runs once per DISTINCT change, not once per lead.
// lead.created is genuinely once-per-lead (no discriminator); status/assign/stage recur.
function eventDiscriminator(eventType: string, p: EventPayload): string {
  switch (eventType) {
    case "lead.status_changed": return p.newStatus ?? "";
    case "lead.assigned": return p.ownerId ?? "";
    case "lead.stage_changed": return (p.changes?.stageId as string) ?? "";
    case "lead.tag_added": return (p.changes?.tagId as string) ?? "";
    // Follow-up triggers fire once per follow-up (they used to fire once per LEAD, ever — so a
    // "follow-up scheduled" automation only ran for a lead's first follow-up).
    case "follow_up.scheduled":
    case "follow_up.completed":
    case "follow_up.rescheduled":
    case "task.completed": return p.followUpId ?? "";
    // Overdue once per due time — a rescheduled follow-up that slips again fires again.
    case "follow_up.overdue": return `${p.followUpId ?? ""}-${(p.changes?.dueAt as string) ?? ""}`;
    // Meeting triggers fire once per meeting (a reschedule once per new time).
    case "meeting.rescheduled": return `${p.meetingId ?? ""}-${p.startAt ?? ""}`;
    case "meeting.scheduled":
    case "meeting.completed":
    case "meeting.no_show":
    case "meeting.cancelled": return p.meetingId ?? "";
    default: return "";
  }
}

async function dispatchTrigger(eventType: string, payload: EventPayload) {
  if (!payload.leadId) return;
  // Stop automations from triggering automations: a change made BY an automation action doesn't
  // cascade into more automations (prevents status ping-pong / assignment loops).
  if (payload.source === "automation") return;

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

  const disc = eventDiscriminator(eventType, payload);
  for (const trigger of activeTriggers) {
    const idempotencyKey = `${trigger.automationId}-${payload.leadId}-${eventType}${disc ? `-${disc}` : ""}`;

    // jobId = idempotencyKey: BullMQ drops a duplicate enqueue of the same (automation, lead, event),
    // so an automation runs at most once per lead per trigger even if the event double-fires.
    await automationQueue.add(`auto-${idempotencyKey}`, {
      automationId: trigger.automationId,
      leadId: payload.leadId,
      triggerType: eventType,
      idempotencyKey,
      payload,
    }, { jobId: idempotencyKey, attempts: 3, backoff: { type: "exponential", delay: 30_000 } });
  }
}

import { ActivityService } from "@/domains/activities/service";
import { NotificationService } from "@/domains/notifications/service";
import { LeadService } from "@/domains/leads/service";
import { WebhookEndpointService, type WebhookEventType } from "@/domains/integrations/webhookEndpointService";
import { MEETING_EVENTS } from "./emitter";

const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// Fire an outbound webhook for a lead event to any org endpoint subscribed to it. Best-effort.
async function fireLeadWebhook(leadId: string, event: WebhookEventType, extra: Record<string, any> = {}) {
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
  // Auto-merge a returning lead into its existing record before any new-lead fan-out. If it merges,
  // the arrival is gone — skip automations/webhook/distribution/CAPI so a returning lead isn't
  // treated as brand new. No-op unless the org enabled auto-merge and a match exists.
  const { DedupService } = await import("@/domains/leads/dedupService");
  if (await DedupService.autoMergeOnCreate(p.leadId).catch(() => false)) return;

  dispatchTrigger('lead.created', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: isUuid(p.userId) ? p.userId : undefined, type: 'note', content: 'Lead was created manually.' });
  await fireLeadWebhook(p.leadId, 'lead.created');
  // Lead distribution: forward a copy to every active recipient (no-op unless configured).
  const { LeadDistributionService } = await import("@/domains/integrations/leadDistributionService");
  await LeadDistributionService.distribute(p.leadId);
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
  const { ScoringService } = await import("@/domains/leads/scoringService");
  void ScoringService.updateLeadScore(p.leadId).catch(() => {});
});

eventBus.on('lead.assigned', async (p) => {
  dispatchTrigger('lead.assigned', p);
  let ownerName: string | undefined;
  if (p.ownerId) {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, p.ownerId))
      .limit(1);
    if (u) {
      ownerName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
    }
  }
  const content = p.ownerId ? `Lead was assigned to ${ownerName ?? "team member"}.` : "Lead was unassigned.";
  await fireLeadWebhook(p.leadId, 'lead.assigned', { ownerId: p.ownerId ?? null, ownerName: ownerName ?? null });
  await ActivityService.addActivity({ leadId: p.leadId, userId: isUuid(p.assignedById) ? p.assignedById : undefined, type: 'note', content });

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

async function statusCategoryForLead(leadId: string, status: string) {
  const { db } = await import("@/db");
  const { leads } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select({ organizationId: leads.organizationId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!row?.organizationId) return null;
  const { CustomStatusSchemaService } = await import("@/domains/leads/customStatusSchemaService");
  return CustomStatusSchemaService.getStatusCategory(row.organizationId, status).catch(() => null);
}

eventBus.on('lead.status_changed', async (p) => {
  dispatchTrigger('lead.status_changed', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `Status changed from ${p.oldStatus} to ${p.newStatus}.` });
  const { ScoringService } = await import("@/domains/leads/scoringService");
  void ScoringService.updateLeadScore(p.leadId).catch(() => {});
  // Resolve by status CATEGORY so custom statuses ("Closed – paid", "Not interested") behave like
  // won/lost — literal keys missed them, so their sequences kept messaging a decided lead.
  const category = p.newStatus ? await statusCategoryForLead(p.leadId, p.newStatus) : null;
  // Stop any running drip once the lead is resolved — no more sequence messages after a decision.
  if (category === 'won' || category === 'lost' || category === 'unqualified') {
    const { SequenceService } = await import("@/domains/leads/sequenceService");
    await SequenceService.stopForLead(p.leadId, `lead marked ${p.newStatus}`).catch(() => {});
  }
  await fireLeadWebhook(p.leadId, 'lead.status_changed', { oldStatus: p.oldStatus, newStatus: p.newStatus });
  const { MetaCapiService } = await import("@/domains/leads/metaCapiService");
  // Meta CAPI: a won lead is the conversion worth optimising toward (hashed-PII event).
  if (category === 'won') {
    await MetaCapiService.track(p.leadId, 'Purchase');
  }
  // Conversion Leads postback: report the CRM status back to Meta by leadgen id, so ad delivery
  // optimises toward leads that actually progress. The service maps status → stage via the tenant's
  // config and no-ops for unmapped statuses, non-Meta leads, and unconfigured tenants.
  if (p.newStatus) {
    await MetaCapiService.trackCrmStage(p.leadId, p.newStatus);
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

// Meetings: automations + outbound webhooks. The meeting service already logs activity/notifies.
for (const ev of MEETING_EVENTS) {
  eventBus.on(ev, async (p) => {
    dispatchTrigger(ev, p);
    if (!p.meetingId) return;
    const { MeetingService } = await import("@/domains/meetings/service");
    const m = await MeetingService.getById(p.meetingId);
    if (!m) return;
    await fireLeadWebhook(p.leadId, ev, {
      meeting: {
        id: m.id, mode: m.mode, title: m.title, status: m.status, startAt: m.startAt.toISOString(), durationMinutes: m.durationMinutes,
        locationName: m.locationName, address: m.address, mapUrl: m.mapUrl, meetingUrl: m.meetingUrl, assigneeId: m.assigneeId, outcome: m.outcome,
      },
    });
  });
}

eventBus.on('task.completed', async (p) => {
  dispatchTrigger('task.completed', p);
  await ActivityService.addActivity({ leadId: p.leadId, userId: p.userId, type: 'note', content: `Task completed: ${p.title}` });
});

}
