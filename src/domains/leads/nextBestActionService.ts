export type ActionPriority = "high" | "medium" | "low";
export type RecommendedActionType =
  | "send_template"
  | "call_lead"
  | "reschedule_followup"
  | "qualify_lead"
  | "reengage_cold_lead"
  | "close_deal";

export interface NextBestActionRecommendation {
  action: RecommendedActionType;
  label: string;
  reason: string;
  priority: ActionPriority;
}

export interface NextBestActionInput {
  status: string;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;
  score?: number;
  phone?: string | null;
  email?: string | null;
  /** Recent open of shared content — a hot buying signal that trumps routine cadence. */
  recentContentOpen?: { title: string; count: number } | null;
}

export class NextBestActionService {
  /**
   * Evaluates lead status and activity metrics to recommend the immediate Next Best Action.
   */
  static getRecommendation(input: NextBestActionInput): NextBestActionRecommendation {
    // Resolved leads (won/lost/unqualified) are not active opportunities — never recommend chasing them.
    if (["won", "lost", "unqualified"].includes(input.status)) {
      return {
        action: "call_lead",
        label: input.status === "won" ? "Deal won" : "Lead closed",
        reason: "No action needed — lead is resolved.",
        priority: "low",
      };
    }

    const now = Date.now();
    const lastContactDays = input.lastContactedAt
      ? (now - new Date(input.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

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

    // 1. New lead without initial contact
    if (input.status === "new" && !input.lastContactedAt) {
      if (input.phone) {
        return {
          action: "send_template",
          label: "Send Welcome WhatsApp Template",
          reason: "New lead requires initial outreach within 24 hours.",
          priority: "high",
        };
      }
      return {
        action: "qualify_lead",
        label: "Complete Lead Details & Qualify",
        reason: "Missing phone number for instant outreach.",
        priority: "high",
      };
    }

    // 2. Overdue follow-up
    if (input.nextFollowUpAt && new Date(input.nextFollowUpAt).getTime() < now) {
      return {
        action: "reschedule_followup",
        label: "Overdue Follow-up: Call Lead Immediately",
        reason: "Scheduled follow-up date has passed.",
        priority: "high",
      };
    }

    // 3. Active lead requiring re-engagement
    if (input.status === "active" && lastContactDays > 5) {
      return {
        action: "reengage_cold_lead",
        label: "Send Re-engagement Message",
        reason: Number.isFinite(lastContactDays)
          ? `No activity recorded for ${Math.floor(lastContactDays)} days.`
          : "No prior contact on record — reach out to re-engage.",
        priority: "medium",
      };
    }

    // 4. High-scoring lead ready to convert
    if (input.status === "active" && (input.score ?? 0) >= 70) {
      return {
        action: "close_deal",
        label: "Schedule Proposal / Close Deal",
        reason: "High engagement score (>= 70) indicates conversion readiness.",
        priority: "high",
      };
    }

    // 5. Default steady follow-up
    return {
      action: "call_lead",
      label: "Routine Touchpoint Call",
      reason: "Maintain active communication cycle.",
      priority: "low",
    };
  }
}
