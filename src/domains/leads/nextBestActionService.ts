import type { StatusCategory } from "./customStatusSchemaService";

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
  recentContentOpen?: { title: string; count: number } | null;
  /** Calls in a row that went unanswered since the lead last engaged. */
  unansweredStreak?: number;
  /** The lead's earliest still-scheduled meeting (may already have ended without an outcome). */
  meeting?: { startAt: Date | string; durationMinutes: number; label: string } | null;
}

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

export class NextBestActionService {
  /**
   * Evaluates lead status and activity metrics to recommend the immediate Next Best Action.
   * Works on the status CATEGORY, so tenants' custom statuses ("Site visit booked", "Closed – paid")
   * get real advice instead of falling through to a generic default.
   */
  static getRecommendation(input: NextBestActionInput): NextBestActionRecommendation {
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
    const lastContactDays = input.lastContactedAt
      ? (now - new Date(input.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;
    const followUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt).getTime() : null;

    // 0. Recent content open — the strongest buying signal, act while they're warm.
    if (input.recentContentOpen && input.recentContentOpen.count > 0) {
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

    // 2. Never contacted
    if (!input.lastContactedAt) {
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

    // 5. Going cold
    if (lastContactDays > 5) {
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
