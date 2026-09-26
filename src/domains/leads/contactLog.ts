import { db } from "@/db";
import { activities, whatsappMessages } from "@/db/schema";
import { ActivityService } from "@/domains/activities/service";
import { markLeadContacted } from "@/domains/follow-ups/state";
import { ScoringService } from "@/domains/leads/scoringService";

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
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
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
}): Promise<{ logged: boolean }> {
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

  // A wrong number isn't contact with the lead, and neither is a call from them we missed; everything
  // else (even an unanswered outgoing call) is an outreach attempt, which is what SLA timing measures.
  if (outcome !== "wrong_number" && !missed) await markLeadContacted(leadId, startedAt);

  // Show personal-mode WhatsApp messages in the lead's WhatsApp thread too. "sent" = handed to the
  // rep's WhatsApp; we can't see delivery for messages that don't go through the Business API.
  if (channel === "whatsapp" && message) {
    await db.insert(whatsappMessages).values({ leadId, userId, direction: "outbound", body: message, status: "sent" });
  }

  void ScoringService.updateLeadScore(leadId).catch(() => {});
  return { logged: true };
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
  void ScoringService.updateLeadScore(leadId).catch(() => {});
}
