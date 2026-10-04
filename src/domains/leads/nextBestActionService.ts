import type { StatusCategory } from "./customStatusSchemaService";
import { nextActionId, type NextAction, type NextActionKind } from "./nextAction";
import { GOING_COLD_DAYS, daysSince } from "@/lib/leads/inactivity";

export type ActionPriority = "high" | "medium" | "low";
export type RecommendedActionType =
  | "send_template"
  | "call_lead"
  | "reschedule_followup"
  | "qualify_lead"
  | "reengage_cold_lead"
  | "close_deal"
  | "try_whatsapp"
  | "log_meeting_outcome"
  | "confirm_meeting"
  | "wait";

export interface NextBestActionRecommendation {
  action: RecommendedActionType;
  label: string;
  reason: string;
  priority: ActionPriority;
  /**
   * The same recommendation in the shared vocabulary (see nextAction.ts). `action`/`label`/`reason`/
   * `priority` are kept alongside it so the existing table, dashboard and lead-page callers keep
   * working unchanged while the lead page migrates to one card.
   */
  nextAction: NextAction;
}

export interface NextBestActionInput {
  status: string;
  /** Category of the (possibly custom) status; derived from the base keys when omitted. */
  statusCategory?: StatusCategory;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;
  score?: number;
  phone?: string | null;
  email?: string | null;
  /** Recent open of shared content — a hot buying signal that trumps routine cadence. */
  recentContentOpen?: { title: string; count: number; lastViewedAt?: Date | string | null } | null;
  /** Calls in a row that went unanswered since the lead last engaged. */
  unansweredStreak?: number;
  /** The lead's earliest still-scheduled meeting (may already have ended without an outcome). */
  meeting?: { startAt: Date | string; durationMinutes: number; label: string } | null;
  /**
   * When this lead actually tends to engage, e.g. "Afternoons (12–5 PM)". Appended to the reason of a
   * contacting action: the single most useful piece of advice available and, until now, computed and
   * then thrown away.
   */
  bestContactWindow?: string | null;
}

/** Each rule action's equivalent in the shared vocabulary. One place, so the two can't drift apart. */
const KIND_FOR: Record<RecommendedActionType, NextActionKind> = {
  send_template: "whatsapp",
  call_lead: "call",
  reschedule_followup: "follow_up",
  qualify_lead: "ask_for_info",
  reengage_cold_lead: "whatsapp",
  close_deal: "meeting",
  try_whatsapp: "whatsapp",
  log_meeting_outcome: "log_meeting_outcome",
  confirm_meeting: "confirm_meeting",
  wait: "wait",
};

/** Kinds worth mentioning a good time to call in. Not wait/ask_for_info — there's nobody to reach. */
const TIMING_WORTHWHILE: NextActionKind[] = ["call", "whatsapp", "email", "meeting"];

const BASE_CATEGORY: Record<string, StatusCategory> = {
  new: "open",
  active: "in_progress",
  won: "won",
  lost: "lost",
  unqualified: "unqualified",
};

export function statusCategoryOf(status: string, explicit?: StatusCategory): StatusCategory {
  return explicit ?? BASE_CATEGORY[status] ?? BASE_CATEGORY[status.toLowerCase()] ?? "open";
}

/** How long a content open still counts as "hot". */
export const HOT_OPEN_MS = 3 * 24 * 60 * 60 * 1000;

function isRecentOpen(lastViewedAt: Date | string | null | undefined, now: number): boolean {
  // No timestamp means we can't date it; trust the caller rather than discard a real signal.
  if (!lastViewedAt) return true;
  const at = new Date(lastViewedAt).getTime();
  return Number.isNaN(at) || now - at <= HOT_OPEN_MS;
}

export class NextBestActionService {
  /**
   * Evaluates lead status and activity metrics to recommend the immediate Next Best Action.
   * Works on the status CATEGORY, so tenants' custom statuses ("Site visit booked", "Closed – paid")
   * get real advice instead of falling through to a generic default.
   */
  static getRecommendation(input: NextBestActionInput): NextBestActionRecommendation {
    const rec = NextBestActionService.recommend(input);
    return { ...rec, nextAction: NextBestActionService.toNextAction(rec, input) };
  }

  /** The same recommendation in the shared NextAction vocabulary, plus the best time to reach them. */
  static toNextAction(rec: Omit<NextBestActionRecommendation, "nextAction">, input: NextBestActionInput): NextAction {
    const kind = KIND_FOR[rec.action];
    const timing = TIMING_WORTHWHILE.includes(kind) ? input.bestContactWindow : null;
    const reason = timing ? `${rec.reason} They engage best ${timing.toLowerCase()}.` : rec.reason;
    return {
      // Keyed on the rule's identity (its action + label), not the reason — the reason now varies
      // with the contact window, and a dismissal must survive that changing.
      id: nextActionId(kind, `${rec.action}:${rec.label}`),
      kind,
      title: rec.label,
      reason,
      evidence: [],
      urgency: rec.priority === "high" ? "now" : rec.priority === "medium" ? "today" : "this_week",
      confidence: rec.priority === "high" ? "high" : rec.priority === "medium" ? "medium" : "low",
      source: "rule",
    };
  }

  private static recommend(input: NextBestActionInput): Omit<NextBestActionRecommendation, "nextAction"> {
    const category = statusCategoryOf(input.status, input.statusCategory);

    // Resolved leads are not active opportunities — never recommend chasing them.
    if (category === "won" || category === "lost" || category === "unqualified") {
      return {
        action: "wait",
        label: category === "won" ? "Deal won" : "Lead closed",
        reason: "No action needed — lead is resolved.",
        priority: "low",
      };
    }

    const now = Date.now();
    const lastContactDays = daysSince(input.lastContactedAt);
    const followUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt).getTime() : null;

    // 0. Recent content open — the strongest buying signal, act while they're warm.
    // The recency window lives here, not in the caller: every caller has to remember it, and one that
    // doesn't turns a view from six weeks ago into "call them now".
    if (input.recentContentOpen && input.recentContentOpen.count > 0 && isRecentOpen(input.recentContentOpen.lastViewedAt, now)) {
      const { title, count } = input.recentContentOpen;
      return {
        action: "call_lead",
        label: "Call now — they're engaging with your content",
        reason: `Opened "${title}" ${count} time${count === 1 ? "" : "s"} recently — strike while interest is high.`,
        priority: "high",
      };
    }

    // 0b. Meetings: an ended meeting needs its outcome logged (not "follow-up overdue"); one in the
    // next 24h is worth confirming so the lead actually turns up.
    if (input.meeting) {
      const start = new Date(input.meeting.startAt).getTime();
      const end = start + input.meeting.durationMinutes * 60_000;
      if (end < now) {
        return {
          action: "log_meeting_outcome",
          label: `Log how the ${input.meeting.label.toLowerCase()} went`,
          reason: "It has ended but has no outcome yet — mark it done or no-show and set the next step.",
          priority: "high",
        };
      }
      if (start - now < 24 * 60 * 60 * 1000) {
        return {
          action: "confirm_meeting",
          label: `${input.meeting.label} coming up — confirm with the lead`,
          reason: "A quick confirmation the day before cuts no-shows.",
          priority: "medium",
        };
      }
    }

    // 1. Overdue follow-up (the rep planned this — it wins over the generic first-contact nudge)
    if (followUpAt !== null && followUpAt < now) {
      return {
        action: "reschedule_followup",
        label: "Follow-up overdue — reach out now",
        reason: "The follow-up you planned has passed.",
        priority: "high",
      };
    }

    // 2. Never contacted. Only for a lead still in "open": once the rep has moved it on, it has been
    // worked (notes, a visit) even if no call/message was logged, so "send a welcome" would be wrong.
    if (!input.lastContactedAt && category === "open") {
      if (input.phone) {
        return {
          action: "send_template",
          label: "Send a welcome message",
          reason: "No contact recorded yet — the first to reply usually wins the deal.",
          priority: "high",
        };
      }
      return {
        action: "qualify_lead",
        label: input.email ? "Email them — no phone on file" : "Add a phone number or email",
        reason: input.email ? "No phone number, so email is the only way to reach this lead." : "There's no way to reach this lead yet.",
        priority: "high",
      };
    }

    // 3. A follow-up is already planned — respect the rep's plan instead of nagging.
    if (followUpAt !== null) {
      return {
        action: "wait",
        label: "Follow-up planned",
        reason: "Your next touch is scheduled — nothing to do until then.",
        priority: "low",
      };
    }

    // 4. Calls going unanswered
    const streak = input.unansweredStreak ?? 0;
    if (streak >= 3 && input.phone) {
      return {
        action: "try_whatsapp",
        label: "Try WhatsApp instead",
        reason: `${streak} calls in a row went unanswered — a message may get through.`,
        priority: "medium",
      };
    }
    if (streak >= 1) {
      return {
        action: "call_lead",
        label: "Call again",
        reason: "The last call wasn't answered — try a different time of day, or schedule a retry.",
        priority: category === "open" ? "high" : "medium",
      };
    }

    // 5. Going cold (not when contact was simply never logged on a lead that's already being worked)
    if (Number.isFinite(lastContactDays) && lastContactDays > GOING_COLD_DAYS) {
      return {
        action: "reengage_cold_lead",
        label: "Send a re-engagement message",
        reason: `No contact for ${Math.floor(lastContactDays)} days.`,
        priority: "medium",
      };
    }

    // 6. Hot lead ready to convert
    if (category === "in_progress" && (input.score ?? 0) >= 70) {
      return {
        action: "close_deal",
        label: "Book a meeting / send proposal",
        reason: "Strong engagement (score 70+) — push for the next commitment.",
        priority: "high",
      };
    }

    // 7. Default
    return {
      action: "reschedule_followup",
      label: "Plan the next follow-up",
      reason: "Recently in touch — set when you'll reach out next so this lead doesn't slip.",
      priority: "low",
    };
  }
}
