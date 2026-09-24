import { Worker, Queue } from "bullmq";
import { and, eq, gte, lte, lt, or, isNull, notExists, sql } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { followUps, leads, reminders } from "@/db/schema";
import { NotificationService } from "@/domains/notifications/service";
import { ActivityService } from "@/domains/activities/service";

export const FOLLOWUP_REMINDER_QUEUE_NAME = "follow-up-reminder-scan";

// How far ahead of due_at we fire the "follow-up due" reminder.
const LEAD_MINUTES = 15;

// Scans for pending follow-ups that are due (or due within LEAD_MINUTES) and haven't been reminded yet,
// then sends one notification each. This replaces per-follow-up delayed jobs: because it reads live
// due_at/status/snooze every run, a reschedule or completion is honoured automatically and no stale
// job can fire. Idempotency: a follow-up is skipped once it has a reminders row with sent_at set.
export async function processFollowUpReminderScan() {
  const now = new Date();
  const horizon = new Date(now.getTime() + LEAD_MINUTES * 60_000);

  const due = await db
    .select({ followUp: followUps, lead: leads })
    .from(followUps)
    .innerJoin(leads, eq(followUps.leadId, leads.id))
    .where(
      and(
        eq(followUps.status, "pending"),
        lte(followUps.dueAt, horizon),
        or(isNull(followUps.snoozedUntil), lte(followUps.snoozedUntil, now)),
        isNull(leads.deletedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(reminders)
            .where(and(eq(reminders.followUpId, followUps.id), sql`${reminders.sentAt} IS NOT NULL`)),
        ),
      ),
    );

  let sent = 0;
  for (const { followUp, lead } of due) {
    const targetUserId = followUp.userId || lead.ownerId;
    if (!targetUserId || !lead.organizationId) continue;

    await NotificationService.create({
      userId: targetUserId,
      type: "follow_up_due",
      title: `Follow-up due: ${followUp.title}`,
      body: `Follow up with ${lead.name} (${followUp.type})`,
      leadId: lead.id,
    });
    await ActivityService.addActivity({
      leadId: lead.id,
      userId: targetUserId,
      type: "note",
      content: `Reminder sent: ${followUp.title}`,
    });
    // Mark as reminded so the next scan skips it (idempotency).
    await db.insert(reminders).values({ followUpId: followUp.id, remindAt: now, sentAt: new Date() });
    sent++;
  }

  if (sent > 0) console.log(`[FOLLOWUP_REMINDER_WORKER] Sent ${sent} follow-up reminders`);
  const overdue = await processOverdueFollowUps(now);
  return { sent, overdue };
}

// How long past due before a follow-up counts as "overdue" (alert + follow_up.overdue trigger).
const OVERDUE_AFTER_MINUTES = 60;

// Once per follow-up (per due time): notify the assignee — also emailed unless they muted
// "Follow-up overdue" — and fire the follow_up.overdue automation trigger. Claimed via a
// conditional update so overlapping scans never double-alert. Only the last 3 days, so a backlog
// of ancient follow-ups can't flood anyone.
export async function processOverdueFollowUps(now = new Date()) {
  const cutoff = new Date(now.getTime() - OVERDUE_AFTER_MINUTES * 60_000);
  const rows = await db
    .select({ followUp: followUps, lead: { id: leads.id, name: leads.name, ownerId: leads.ownerId, organizationId: leads.organizationId } })
    .from(followUps)
    .innerJoin(leads, eq(followUps.leadId, leads.id))
    .where(
      and(
        eq(followUps.status, "pending"),
        isNull(followUps.overdueNotifiedAt),
        lt(followUps.dueAt, cutoff),
        gte(followUps.dueAt, new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
        or(isNull(followUps.snoozedUntil), lte(followUps.snoozedUntil, now)),
        isNull(leads.deletedAt),
      ),
    )
    .limit(500);

  let alerted = 0;
  for (const { followUp, lead } of rows) {
    const [claimed] = await db
      .update(followUps)
      .set({ overdueNotifiedAt: now })
      .where(and(eq(followUps.id, followUp.id), isNull(followUps.overdueNotifiedAt)))
      .returning({ id: followUps.id });
    if (!claimed) continue;
    const target = followUp.userId || lead.ownerId;
    if (target && lead.organizationId) {
      await NotificationService.create({
        userId: target,
        type: "follow_up_overdue",
        title: `Overdue: ${followUp.title}`,
        body: `Follow-up with ${lead.name} was due and hasn't been done.`,
        leadId: lead.id,
      });
    }
    eventBus.emit("follow_up.overdue", {
      leadId: lead.id,
      userId: followUp.userId ?? undefined,
      followUpId: followUp.id,
      type: followUp.type,
      title: followUp.title,
      changes: { dueAt: new Date(followUp.dueAt).toISOString() },
    });
    alerted++;
  }
  if (alerted > 0) console.log(`[FOLLOWUP_REMINDER_WORKER] ${alerted} follow-ups went overdue`);
  return alerted;
}

export function createFollowUpReminderWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(FOLLOWUP_REMINDER_QUEUE_NAME, processFollowUpReminderScan, { connection });
  worker.on("failed", (job, err) => console.error(`[FOLLOWUP_REMINDER_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

// Repeating scan every 5 minutes. Call once from the worker runner alongside the other scans.
export async function scheduleFollowUpReminderScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(FOLLOWUP_REMINDER_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "follow-up-reminder-scan",
    { every: 5 * 60 * 1000 },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } },
  );
  return queue;
}
