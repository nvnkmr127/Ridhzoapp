import { db } from "@/db";
import { whatsappMessages } from "@/db/schema";
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

// Without this, personal-mode contact left no trace: no timeline entry and no last_contacted_at, so
// response-time/SLA metrics, the Next Best Action and cold-lead detection treated the lead as untouched.
export async function recordLeadContact(input: {
  leadId: string;
  userId: string;
  channel: ContactChannel;
  outcome?: CallOutcome;
  note?: string;
  message?: string; // text prefilled into WhatsApp, if any
}) {
  const { leadId, userId, channel, outcome, note, message } = input;
  let content: string;
  if (channel === "call") {
    content = `Called — ${outcome ? CALL_OUTCOMES[outcome] : "outcome not recorded"}`;
  } else if (channel === "whatsapp") {
    content = message ? `WhatsApp opened with message: ${message}` : "Opened WhatsApp chat";
  } else {
    content = "Opened email to lead";
  }
  if (note) content += `\nNote: ${note}`;

  await ActivityService.addActivity({
    leadId,
    userId,
    type: channel === "call" ? "call" : channel === "email" ? "email" : "message",
    content,
  });

  // A wrong number isn't contact with the lead; everything else (even an unanswered call) is an
  // outreach attempt, which is what first-response/SLA timing measures.
  if (outcome !== "wrong_number") await markLeadContacted(leadId);

  // Show personal-mode WhatsApp messages in the lead's WhatsApp thread too. "sent" = handed to the
  // rep's WhatsApp; we can't see delivery for messages that don't go through the Business API.
  if (channel === "whatsapp" && message) {
    await db.insert(whatsappMessages).values({ leadId, userId, direction: "outbound", body: message, status: "sent" });
  }

  void ScoringService.updateLeadScore(leadId).catch(() => {});
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
