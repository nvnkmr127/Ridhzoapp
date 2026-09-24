import { Worker, Queue } from "bullmq";
import { and, eq, gte, lte, isNull, type SQL } from "drizzle-orm";
import { createRedis, quietErrors } from "../redis";
import { db } from "@/db";
import { meetings, leads } from "@/db/schema";
import { NotificationService } from "@/domains/notifications/service";
import { MeetingService } from "@/domains/meetings/service";
import { meetingEnd, modeLabel } from "@/domains/meetings/format";

export const MEETING_REMINDER_QUEUE_NAME = "meeting-reminder-scan";

const MIN = 60_000;
const HOUR = 60 * MIN;

type Due = "lead_24h" | "lead_1h" | "rep" | "outcome";
type Row = {
  startAt: Date;
  durationMinutes: number;
  bookedAt: Date;
  leadReminder24hSentAt: Date | null;
  leadReminder1hSentAt: Date | null;
  repReminderSentAt: Date | null;
  outcomePromptSentAt: Date | null;
};

// Pure: which reminders a scheduled meeting needs right now. Lead reminders only fire when the
// booking was made well before the reminder point (no "tomorrow's meeting" nudge 5 minutes after
// booking a same-day slot).
export function dueReminders(m: Row, now: Date): Due[] {
  const start = m.startAt.getTime();
  const lead = start - m.bookedAt.getTime();
  const t = now.getTime();
  const out: Due[] = [];
  if (!m.leadReminder24hSentAt && t >= start - 24 * HOUR && t < start - 2 * HOUR && lead > 26 * HOUR) out.push("lead_24h");
  if (!m.leadReminder1hSentAt && t >= start - 75 * MIN && t < start && lead > 3 * HOUR) out.push("lead_1h");
  if (!m.repReminderSentAt && t >= start - 30 * MIN && t < start + 10 * MIN) out.push("rep");
  if (!m.outcomePromptSentAt && t >= meetingEnd(m).getTime() + 15 * MIN) out.push("outcome");
  return out;
}

const FLAG = {
  lead_24h: meetings.leadReminder24hSentAt,
  lead_1h: meetings.leadReminder1hSentAt,
  rep: meetings.repReminderSentAt,
  outcome: meetings.outcomePromptSentAt,
} as const;
const FLAG_KEY = { lead_24h: "leadReminder24hSentAt", lead_1h: "leadReminder1hSentAt", rep: "repReminderSentAt", outcome: "outcomePromptSentAt" } as const;

// Claim a reminder before sending: only the scan that flips the flag from null sends it, so two
// overlapping scans (or a retry) never double-message a lead.
async function claim(id: string, kind: Due) {
  const [row] = await db.update(meetings)
    .set({ [FLAG_KEY[kind]]: new Date() })
    .where(and(eq(meetings.id, id), isNull(FLAG[kind]) as SQL))
    .returning({ id: meetings.id });
  return !!row;
}

export async function processMeetingReminderScan() {
  const now = new Date();
  // Window: outcome prompts look back a week; reminders look ahead a day.
  const rows = await db
    .select({ meeting: meetings, lead: { name: leads.name, ownerId: leads.ownerId } })
    .from(meetings)
    .innerJoin(leads, eq(meetings.leadId, leads.id))
    .where(and(
      eq(meetings.status, "scheduled"),
      gte(meetings.startAt, new Date(now.getTime() - 7 * 24 * HOUR)),
      lte(meetings.startAt, new Date(now.getTime() + 24 * HOUR)),
      isNull(leads.deletedAt),
    ));

  let sent = 0;
  for (const { meeting: m, lead } of rows) {
    const rep = m.assigneeId || lead.ownerId;
    for (const kind of dueReminders(m, now)) {
      if (!(await claim(m.id, kind))) continue;
      try {
        if (kind === "lead_24h" || kind === "lead_1h") {
          await MeetingService.notifyLead("reminder", m, { send: true });
        } else if (rep && kind === "rep") {
          await NotificationService.create({
            userId: rep,
            type: "meeting_reminder",
            title: `${modeLabel(m.mode)} with ${lead.name} starts soon`,
            body: m.meetingUrl || [m.locationName, m.address].filter(Boolean).join(", ") || m.title,
            leadId: m.leadId,
          });
        } else if (rep && kind === "outcome") {
          await NotificationService.create({
            userId: rep,
            type: "meeting_outcome",
            title: `How did the ${modeLabel(m.mode).toLowerCase()} with ${lead.name} go?`,
            body: "Mark it done or no-show and set the next step.",
            leadId: m.leadId,
          });
        }
        sent++;
      } catch (e) {
        console.error(`[MEETING_REMINDER_WORKER] ${kind} for ${m.id} failed`, e);
      }
    }
  }
  if (sent > 0) console.log(`[MEETING_REMINDER_WORKER] Sent ${sent} meeting reminders`);
  return { sent };
}

export function createMeetingReminderWorker(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const worker = new Worker(MEETING_REMINDER_QUEUE_NAME, processMeetingReminderScan, { connection });
  worker.on("failed", (job, err) => console.error(`[MEETING_REMINDER_WORKER] Job ${job?.id} failed:`, err));
  quietErrors(worker);
  return worker;
}

export async function scheduleMeetingReminderScan(redisUrl?: string) {
  const connection = createRedis({ maxRetriesPerRequest: null }, redisUrl);
  const queue = new Queue(MEETING_REMINDER_QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    "meeting-reminder-scan",
    { every: 5 * 60 * 1000 },
    { name: "scan", opts: { removeOnComplete: true, removeOnFail: 20 } },
  );
  return queue;
}
