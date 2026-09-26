import { and, desc, eq, gte, inArray, isNull, like, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { activities, whatsappMessages, followUps, leads, organizations } from "@/db/schema";
import { ActivityService } from "@/domains/activities/service";
import { markLeadContacted } from "@/domains/follow-ups/state";
import { ScoringService } from "@/domains/leads/scoringService";
import { eventBus } from "@/lib/events/emitter";
import { DEFAULT_FORMAT } from "@/lib/format";
import { startOfZonedDay } from "@/lib/tz";
import { keepAlive } from "@/lib/keepAlive";

// Outreach the rep did OUTSIDE Ridhzo (phone call, their own WhatsApp, their own mail app), and replies
// they paste in. Shared by the web actions and the mobile API; callers check lead access first.

export const CALL_OUTCOMES = {
  answered: "Answered",
  no_answer: "No answer",
  busy: "Busy / call back later",
  wrong_number: "Wrong number",
} as const;
export type CallOutcome = keyof typeof CALL_OUTCOMES;
export type ContactChannel = "call" | "whatsapp" | "email";

export type CallDirection = "outgoing" | "incoming";

// "3m 12s" / "45s" — talk time as shown on the timeline.
export function formatCallDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

// How close a hand-logged call must be to the phone's record of it to be the same call: the rep logs
// it during or just after the call, so from the call's start to 10 min after it ended.
const MERGE_WINDOW_MS = 10 * 60 * 1000;
// A missed call older than this is history, not a callback to book now (sync backfills a week).
const CALLBACK_WITHIN_MS = 48 * 60 * 60 * 1000;

// The rep logged this call by hand (no call-log id — e.g. the app couldn't read the call log in time),
// and now the phone's record of it arrives. Attach the duration and id to that entry instead of adding
// a second one. Returns true when merged. The rep's own outcome and note are kept.
async function mergeIntoManualLog(input: { leadId: string; userId: string; startedAt: Date; durationSec: number; externalRef: string }) {
  const { leadId, userId, startedAt, durationSec, externalRef } = input;
  const from = new Date(startedAt.getTime() - MERGE_WINDOW_MS);
  const to = new Date(startedAt.getTime() + durationSec * 1000 + MERGE_WINDOW_MS);
  const [manual] = await db
    .select({ id: activities.id, content: activities.content })
    .from(activities)
    .where(
      and(
        eq(activities.leadId, leadId),
        eq(activities.userId, userId),
        eq(activities.type, "call"),
        isNull(activities.externalRef),
        like(activities.content, "Called — %"),
        gte(activities.occurredAt, from),
        lte(activities.occurredAt, to),
      ),
    )
    .orderBy(activities.occurredAt)
    .limit(1);
  if (!manual) return false;
  const content = durationSec > 0 ? (manual.content ?? "").replace(/^([^\n]*)/, `$1 (${formatCallDuration(durationSec)})`) : manual.content;
  await db.update(activities).set({ externalRef, durationSec, occurredAt: startedAt, content, updatedAt: new Date() }).where(eq(activities.id, manual.id));
  return true;
}

// Without this, personal-mode contact left no trace: no timeline entry and no last_contacted_at, so
// response-time/SLA metrics, the Next Best Action and cold-lead detection treated the lead as untouched.
// Calls read from the phone's call log also carry durationSec/startedAt/direction and an externalRef
// (the device's call id): a call already logged under that ref is skipped, so returns logged: false.
export async function recordLeadContact(input: {
  leadId: string;
  userId: string;
  channel: ContactChannel;
  outcome?: CallOutcome;
  note?: string;
  message?: string; // text prefilled into WhatsApp, if any
  durationSec?: number;
  startedAt?: Date;
  direction?: CallDirection;
  externalRef?: string;
}): Promise<{ logged: boolean; completedFollowUpIds?: string[] }> {
  const { leadId, userId, channel, note, message, durationSec, startedAt, externalRef } = input;
  const incoming = channel === "call" && input.direction === "incoming";
  // The call log knows whether it connected; the rep still picks busy / wrong number themselves.
  const outcome = input.outcome ?? (durationSec == null ? undefined : durationSec > 0 ? "answered" : "no_answer");
  const missed = incoming && outcome !== "answered";

  let content: string;
  if (channel === "call") {
    const talk = durationSec ? ` (${formatCallDuration(durationSec)})` : "";
    if (missed) content = "Missed call from lead";
    else if (incoming) content = `Incoming call — Answered${talk}`;
    else content = `Called — ${outcome ? CALL_OUTCOMES[outcome] : "outcome not recorded"}${talk}`;
  } else if (channel === "whatsapp") {
    content = message ? `WhatsApp opened with message: ${message}` : "Opened WhatsApp chat";
  } else {
    content = "Opened email to lead";
  }
  if (note) content += `\nNote: ${note}`;

  if (channel === "call" && !incoming && externalRef && startedAt && durationSec != null) {
    // Already have this exact call. Usually the background sync got it first — it runs as the rep
    // comes back from the dialer, while the "How did it go?" sheet is still open. The rep's outcome
    // and note are what they said about the call: put them on that entry rather than dropping them.
    const [known] = await db
      .select({ id: activities.id, content: activities.content })
      .from(activities)
      .where(and(eq(activities.userId, userId), eq(activities.externalRef, externalRef)))
      .limit(1);
    if (known) {
      if ((input.outcome || note) && known.content !== content) {
        await db.update(activities).set({ content, updatedAt: new Date() }).where(eq(activities.id, known.id));
      }
      return { logged: false };
    }
    // A hand-logged entry for it → fill in the duration and call id.
    if (await mergeIntoManualLog({ leadId, userId, startedAt, durationSec, externalRef })) {
      return { logged: false };
    }
  }

  const inserted = await db
    .insert(activities)
    .values({
      leadId,
      userId,
      type: channel === "call" ? "call" : channel === "email" ? "email" : "message",
      content,
      durationSec: channel === "call" ? durationSec : undefined,
      externalRef,
      ...(startedAt ? { occurredAt: startedAt } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: activities.id });
  if (!inserted.length) return { logged: false };

  const completedFollowUpIds: string[] = [];

  if (channel === "call") {
    // Unanswered run including this call — "not answered 3 times in a row" automations read it.
    const recent = await db
      .select({ type: activities.type, content: activities.content, durationSec: activities.durationSec })
      .from(activities)
      .where(and(eq(activities.leadId, leadId), eq(activities.type, "call")))
      .orderBy(desc(activities.occurredAt))
      .limit(20);
    eventBus.emit("call.logged", {
      leadId,
      userId,
      call: {
        activityId: inserted[0].id,
        outcome: missed ? "missed" : outcome ?? "unknown",
        direction: incoming ? "incoming" : "outgoing",
        durationSec: durationSec ?? null,
        unansweredStreak: ScoringService.callStats(recent).unansweredStreak,
      },
    });
  }

  // Day boundaries in the workspace's timezone (follow-up "due today", callback dedupe).
  const at = startedAt ?? new Date();
  let tz: string | null = null;
  const endOfDay = async (d: Date) => {
    if (!tz) {
      const [org] = await db
        .select({ timezone: organizations.timezone })
        .from(leads)
        .innerJoin(organizations, eq(organizations.id, leads.organizationId))
        .where(eq(leads.id, leadId))
        .limit(1);
      tz = org?.timezone || DEFAULT_FORMAT.timezone;
    }
    return startOfZonedDay(d, tz, 1);
  };

  // A wrong number isn't contact with the lead, and neither is a call from them we missed; everything
  // else (even an unanswered outgoing call) is an outreach attempt, which is what SLA timing measures.
  if (outcome !== "wrong_number" && !missed) {
    await markLeadContacted(leadId, startedAt);

    // Auto-complete the follow-ups this contact answers, so reps don't tick them off by hand. Only when
    // the lead was actually reached: an unanswered call (often from the phone's own dialer, synced in
    // the background with no one asked) must leave "Call Ravi" open, or the lead silently drops.
    // Which ones: same kind (call → "call", WhatsApp → "whatsapp") or generic "follow-up"s, due by the
    // end of that day — and ones that existed before the contact or were already due then, so a call
    // synced late never completes a follow-up the rep booked after it ("call again at 3pm").
    const reached = channel !== "call" || outcome === "answered";
    if (reached) {
      const kinds = channel === "call" ? ["call", "followup"] : channel === "email" ? ["email", "followup"] : ["whatsapp", "followup"];
      const pending = await db
        .select({ id: followUps.id })
        .from(followUps)
        .where(and(
          eq(followUps.leadId, leadId),
          inArray(followUps.type, kinds),
          eq(followUps.status, "pending"),
          lt(followUps.dueAt, await endOfDay(at)),
          or(lte(followUps.createdAt, at), lte(followUps.dueAt, at)),
        ));

      if (pending.length > 0) {
        const { FollowUpService } = await import("@/domains/follow-ups/service");
        for (const f of pending) {
          await FollowUpService.completeFollowUp(f.id);
          completedFollowUpIds.push(f.id);
        }
      }
    }
  }

  // Missed call from a lead → callback task, due from the moment they called (so the rep's call back,
  // even one synced in the same batch, completes it). Not for old history — turning sync on uploads
  // the last week, and week-old missed calls aren't a to-do now — and not when a call follow-up is
  // already due today (three missed calls in a row are one call back; next week's call isn't one).
  if (missed && Date.now() - at.getTime() < CALLBACK_WITHIN_MS) {
    const [openCallback] = await db
      .select({ id: followUps.id })
      .from(followUps)
      .where(and(eq(followUps.leadId, leadId), eq(followUps.type, "call"), eq(followUps.status, "pending"), lt(followUps.dueAt, await endOfDay(new Date()))))
      .limit(1);
    if (!openCallback) {
      const { FollowUpService } = await import("@/domains/follow-ups/service");
      const [leadRec] = await db.select({ name: leads.name, ownerId: leads.ownerId }).from(leads).where(eq(leads.id, leadId)).limit(1);
      await FollowUpService.createFollowUp({
        leadId,
        type: "call",
        title: leadRec?.name ? `Call back ${leadRec.name}` : "Call back",
        dueAt: at,
        userId: leadRec?.ownerId ?? userId,
      });
    }
  }

  // Show personal-mode WhatsApp messages in the lead's WhatsApp thread too. "sent" = handed to the
  // rep's WhatsApp; we can't see delivery for messages that don't go through the Business API.
  if (channel === "whatsapp" && message) {
    await db.insert(whatsappMessages).values({ leadId, userId, direction: "outbound", body: message, status: "sent" });
  }

  keepAlive(ScoringService.updateLeadScore(leadId), "lead score");
  return { logged: true, completedFollowUpIds };
}

// "They replied" — lands in the WhatsApp thread as inbound (so the AI and scoring see real intent)
// and stops any running sequence, exactly like a Business API inbound message would.
export async function recordLeadReply(input: { leadId: string; userId: string; channel: ContactChannel; message: string }) {
  const { leadId, userId, channel, message } = input;
  if (channel === "whatsapp") {
    await db.insert(whatsappMessages).values({ leadId, userId, direction: "inbound", body: message, status: "read" });
  }
  await ActivityService.addActivity({
    leadId,
    userId,
    type: channel === "email" ? "email" : "message",
    content: `Lead replied${channel === "whatsapp" ? " on WhatsApp" : channel === "email" ? " by email" : ""}: ${message}`,
  });
  const { SequenceService } = await import("@/domains/leads/sequenceService");
  await SequenceService.stopForLead(leadId, "lead replied").catch(() => {});
  keepAlive(ScoringService.updateLeadScore(leadId), "lead score");
}
