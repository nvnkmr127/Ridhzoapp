// "What should I do with this lead right now, why, and can Ridhzo do it for me?" — one vocabulary,
// emitted by both producers.
//
// This exists because there were two. `RecommendedActionType` (10 values, rule-based, in
// nextBestActionService) and `NextStepKind` (6 values, AI-produced, in leadPlan) answered the same
// question with different words, and the lead page rendered both at once — two competing panels, two
// sets of buttons, the AI's reasoning sitting underneath the rule's instead of replacing it.
//
// `NextAction` is the single shape both now produce. `source` keeps the provenance so the UI can be
// honest about whether a suggestion came from a deterministic rule or from the model.
//
// Pure and framework-free: rules, the AI validator, the UI card and the executor all depend on it.

/**
 * The kinds of thing that can be done next. Every kind here maps onto something the app can actually
 * execute — a kind that exists only as a label, with no service behind it, is a button that lies.
 *
 * Merged rather than double-listed: spec items that were really the same action (e.g. "schedule a
 * call" and "call them back") collapsed into one kind with the detail living in `title`/`reason`.
 */
export type NextActionKind =
  // Reaching out — these contact a human and cost the tenant money if sent wrong.
  | "call"
  | "whatsapp"
  | "email"
  | "meeting"
  | "follow_up"
  // Working the record rather than the lead.
  | "share_document"
  | "enroll_sequence"
  | "stop_sequence"
  | "change_status"
  | "assign"
  | "escalate"
  | "log_meeting_outcome"
  | "confirm_meeting"
  | "ask_for_info"
  | "qualify"
  | "mark_qualified"
  | "mark_unqualified"
  // Deliberate inaction — a real answer, and the one most often missing from a "next best action".
  | "wait"
  | "do_nothing";

export const NEXT_ACTION_KINDS: NextActionKind[] = [
  "call", "whatsapp", "email", "meeting", "follow_up",
  "share_document", "enroll_sequence", "stop_sequence",
  "change_status", "assign", "escalate",
  "log_meeting_outcome", "confirm_meeting", "ask_for_info",
  "qualify", "mark_qualified", "mark_unqualified",
  "wait", "do_nothing",
];

/**
 * Kinds that reach out to the lead. Used to gate urgency alerts: proposing contact is not the same as
 * proposing record-keeping, and only the former should be able to push a notification.
 */
export const CONTACT_KINDS: NextActionKind[] = ["call", "whatsapp", "email", "meeting"];

/** Kinds that need a `message` to be actionable as a one-tap send. */
export const MESSAGE_KINDS: NextActionKind[] = ["whatsapp", "email"];

/** Kinds where doing nothing is the correct answer — the UI says so instead of rendering no buttons. */
export const INACTION_KINDS: NextActionKind[] = ["wait", "do_nothing"];

export type NextActionUrgency = "now" | "today" | "this_week";
export type NextActionConfidence = "high" | "medium" | "low";

export interface NextAction {
  /** Stable across regenerations (hash of kind + its identity), so a dismissal sticks. */
  id: string;
  kind: NextActionKind;
  /** Imperative, ≤100 chars: "Call about Saturday's site visit". */
  title: string;
  /** ≤240 chars, and must cite something concrete from the lead — never "stay in touch". */
  reason: string;
  /** Verbatim quotes backing the reason. Empty for rules, which cite facts rather than text. */
  evidence: string[];
  urgency: NextActionUrgency;
  confidence: NextActionConfidence;
  /** Ready-to-send text, only for `whatsapp` / `email`. */
  message?: string;
  /** Which workspace status this moves the lead to — only for the status-changing kinds. */
  statusKey?: string;
  /** ISO datetime, when this should happen. */
  followUpAt?: string;
  source: "rule" | "ai";
}

/** djb2 — same scheme as leadPlan's, so ids look alike across the two producers. */
export function nextActionId(kind: string, identity: string): string {
  let h = 5381;
  const s = `${kind}:${identity}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `n_${(h >>> 0).toString(36)}`;
}

export function isContacting(a: Pick<NextAction, "kind">): boolean {
  return CONTACT_KINDS.includes(a.kind);
}

export function isInaction(a: Pick<NextAction, "kind">): boolean {
  return INACTION_KINDS.includes(a.kind);
}

/**
 * A rule recommendation expressed as a NextAction. The rule engine already decided the priority; this
 * only re-expresses it, so the mapping is deliberately mechanical — no judgement added here.
 */
export function ruleAction(kind: NextActionKind, title: string, reason: string, priority: "high" | "medium" | "low", identity = title): NextAction {
  return {
    id: nextActionId(kind, identity),
    kind,
    title,
    reason,
    evidence: [],
    urgency: priority === "high" ? "now" : priority === "medium" ? "today" : "this_week",
    confidence: priority === "high" ? "high" : priority === "medium" ? "medium" : "low",
    source: "rule",
  };
}