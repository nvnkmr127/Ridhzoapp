import "server-only";
import { CustomFieldService } from "@/domains/customFields/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { FollowUpService } from "@/domains/follow-ups/service";
import { LeadService } from "@/domains/leads/service";
import { SequenceService } from "@/domains/leads/sequenceService";
import { MeetingService } from "@/domains/meetings/service";
import { modeLabel } from "@/domains/meetings/format";
import { assignLeadAction } from "@/lib/actions/leads";
import { sendMeetingConfirmationAction, setMeetingOutcomeAction } from "@/lib/actions/meetings";
import { sendEmailAction, sendWhatsAppAction } from "@/lib/actions/messaging";
import { createShareAction } from "@/lib/actions/sharedContent";
import { followUpTypeLabel, type FollowUpType } from "@/lib/followUps/types";
import { markAiSuggestionDone, type RecapCache } from "@/lib/ai/leadAssist";
import { visiblePlan } from "@/lib/ai/leadPlan";
import { isInaction, type NextAction, type NextActionKind } from "@/domains/leads/nextAction";
import type { ActionErrorCode } from "@/lib/actions/result";

type Lead = NonNullable<Awaited<ReturnType<typeof LeadService.getLead>>>;

export type ApplyResult = { ok: true; applied: string } | { ok: false; code: ActionErrorCode; message: string };

/**
 * Applies ONE AI suggestion the rep accepted — shared by the web action and the mobile API, which
 * each check lead access and edit permission first. The suggestion is looked up from what was saved
 * with the recap (never taken from the caller), and applied with the same validation as a manual edit:
 * the field's own type/options, the workspace's status list and won/lost bookkeeping, and a normal
 * follow-up.
 */
export async function applyAiSuggestion(input: {
  lead: Lead;
  organizationId: string;
  userId: string | null;
  isAdmin: boolean;
  id: string;
}): Promise<ApplyResult> {
  const { lead, organizationId, userId, isAdmin, id } = input;
  const cd = (lead.customData as Record<string, unknown> | null) ?? {};
  const saved = cd._aiRecap as RecapCache | undefined;
  const plan = visiblePlan(saved?.plan, saved?.dismissed);

  const field = plan.fields.find((f) => f.id === id);
  if (field) {
    const merged = { ...cd, [field.key]: field.value };
    let validated: Record<string, unknown>;
    try {
      validated = await CustomFieldService.validate(organizationId, merged, { isAdmin, existing: cd });
    } catch (e) {
      return { ok: false, code: "VALIDATION", message: (e as Error)?.message || "That value isn't valid for this field any more." };
    }
    // Same merge as a manual save: validated is authoritative for editable fields; every other stored
    // key (AI recap, scoring, attribution, admin-only fields for non-admins) is kept as is.
    const defs = await CustomFieldService.list(organizationId);
    const editable = new Set(defs.filter((d) => !d.disabled && (isAdmin || !d.adminOnly)).map((d) => d.key));
    if (!editable.has(field.key)) return { ok: false, code: "VALIDATION", message: "That field can't be edited any more." };
    const result: Record<string, unknown> = { ...validated };
    for (const [k, v] of Object.entries(cd)) if (!(k in result) && !editable.has(k)) result[k] = v;
    const updated = await LeadService.updateCustomData(lead.id, result, organizationId);
    if (!updated) return { ok: false, code: "NOT_FOUND", message: "This lead no longer exists or was moved." };
    await markAiSuggestionDone(lead.id, organizationId, id);
    return { ok: true, applied: `${field.label} set to ${field.display}` };
  }

  if (plan.status?.id === id) {
    const target = plan.status;
    const statuses = await CustomStatusSchemaService.getTenantStatusSchema(organizationId);
    if (!statuses.some((s) => s.key === target.key)) {
      return { ok: false, code: "VALIDATION", message: `The status "${target.label}" no longer exists.` };
    }
    const updated = await LeadService.changeStatus(lead.id, target.key, userId, organizationId, target.reason);
    if (!updated) return { ok: false, code: "NOT_FOUND", message: "This lead no longer exists or was moved." };
    await markAiSuggestionDone(lead.id, organizationId, id);
    return { ok: true, applied: `Status changed to ${target.label}` };
  }

  if (plan.next?.id === id) {
    const res = await executeNextAction({ lead, organizationId, userId, action: plan.next });
    // A prompt means the server needs something only a human can supply (a reviewed message, a
    // meeting outcome, an owner). Saying so is the honest answer here; the lead-page card drives
    // those through `executeAiActionAction`, which can show the dialog.
    if (!res.ok) return res;
    if ("prompt" in res) return { ok: false, code: "VALIDATION", message: promptMessage(res.prompt) };
    await markAiSuggestionDone(lead.id, organizationId, id);
    return { ok: true, applied: res.applied };
  }

  return { ok: false, code: "NOT_FOUND", message: "That suggestion is out of date — refresh the AI recap." };
}

/** Why an action can't be done from one click, in words a rep can act on. */
export function promptMessage(prompt: NextActionPrompt): string {
  switch (prompt.kind) {
    case "review_send":
      return prompt.channel === "email"
        ? "Review the draft email on the lead page before it sends."
        : "Review the draft WhatsApp on the lead page before it sends.";
    case "confirm_meeting":
      return "Confirm the meeting from the Meetings tab — that sends the lead a confirmation.";
    case "log_meeting_outcome":
      return "Record what happened at the meeting from its outcome dialog.";
    case "choose_owner":
      return "Pick who should own this from the Assign control.";
    case "choose_content":
      return "Choose what to share from the Share dialog.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Executing a NextAction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Something only the rep can supply, so the server asks instead of guessing. Guessing is what made
 * these buttons lie: an "email the quote" button that sent the lead a message nobody read, or a
 * "log the outcome" button that recorded a site visit that never happened.
 */
export type NextActionPrompt =
  /** Outbound is irreversible, so the rep sees the exact text before it leaves. */
  | { kind: "review_send"; channel: "whatsapp" | "email"; subject: string; body: string }
  /** Confirming a meeting mails the lead, so it is outbound and goes through the Meetings tab. */
  | { kind: "confirm_meeting"; meetingId: string }
  /** Whether a meeting happened is not something the model knows. */
  | { kind: "log_meeting_outcome"; meetingId: string }
  | { kind: "choose_owner" }
  /** The AI must never invent a URL to send. */
  | { kind: "choose_content"; title: string };

export type ExecuteResult =
  | { ok: true; applied: string }
  | { ok: true; prompt: NextActionPrompt }
  | { ok: false; code: ActionErrorCode; message: string };

/** What the rep chose in the prompt dialog. Absent → we ask again. */
export interface ExecuteAnswer {
  subject?: string;
  ownerId?: string;
  share?: { targetUrl?: string; bodyText?: string; imageUrl?: string };
  meetingOutcome?: { status: "completed" | "no_show" | "cancelled"; outcome?: string | null; nextFollowUpAt?: string | null };
}

/** Kinds that book something onto the rep's list, and as which follow-up type. */
const FOLLOW_UP_FOR: Partial<Record<NextActionKind, FollowUpType>> = {
  call: "call",
  follow_up: "followup",
  ask_for_info: "call",
  // A proposed meeting with no agreed slot is a task, not a calendar entry — nothing is booked and
  // nobody is notified until the rep picks a real time.
  meeting: "task",
};

/** Kinds that move the lead's status. Each resolves to a real workspace status at generation time. */
const STATUS_KINDS: NextActionKind[] = ["change_status", "qualify", "mark_qualified", "mark_unqualified"];

const DAY_MS = 86_400_000;

/**
 * Does what a `NextAction` says, or explains what it still needs.
 *
 * Two rules shape the branch split:
 *
 * **Internal, reversible work goes through domain services.** Both entry points (the web server
 * action and the `/api/v1` route) have already checked permission and org scope themselves, and the
 * API-key path has no next-auth session for a session-scoped action to read. The plan gates —
 * sequence plan caps in `SequenceService.enroll`, meeting side-effects in `setOutcome` — live in the
 * services, so they still apply.
 *
 * **Anything that reaches the lead goes through the session-scoped send actions.** That means only a
 * signed-in rep can put a message in front of a lead: an API key cannot fire one even if it manages
 * to pass `confirm`.
 */
export async function executeNextAction(input: {
  lead: Lead;
  organizationId: string;
  userId: string | null;
  action: NextAction;
  confirm?: boolean;
  answer?: ExecuteAnswer;
}): Promise<ExecuteResult> {
  const { lead, organizationId, userId, action, answer } = input;
  const assignee = userId ?? lead.ownerId ?? null;

  if (action.kind === "whatsapp" || action.kind === "email") {
    const body = action.message?.trim();
    if (!body) return { ok: false, code: "VALIDATION", message: `Ridhzo has no wording for this — open the ${action.kind} composer and it'll be waiting.` };
    const subject = answer?.subject?.trim() || emailSubject(action);
    if (!input.confirm) return { ok: true, prompt: { kind: "review_send", channel: action.kind, subject, body } };
    const res = action.kind === "whatsapp"
      ? await sendWhatsAppAction({ leadId: lead.id, body })
      : await sendEmailAction({ leadId: lead.id, subject, body });
    if (!res.ok) return { ok: false, code: res.code, message: res.message };
    return { ok: true, applied: action.kind === "whatsapp" ? "WhatsApp sent" : "Email sent" };
  }

  if (STATUS_KINDS.includes(action.kind)) {
    const key = action.statusKey;
    if (!key) return { ok: false, code: "VALIDATION", message: "There's no status to move them to — refresh the AI recap." };
    const statuses = await CustomStatusSchemaService.getTenantStatusSchema(organizationId);
    const target = statuses.find((s) => s.key === key);
    if (!target) return { ok: false, code: "VALIDATION", message: `The status "${key}" no longer exists.` };
    if (lead.status === key) return { ok: false, code: "CONFLICT", message: `${lead.name || "They"}'s already ${target.label}.` };
    const updated = await LeadService.changeStatus(lead.id, key, userId, organizationId, action.reason || undefined);
    if (!updated) return { ok: false, code: "NOT_FOUND", message: "This lead no longer exists or was moved." };
    return { ok: true, applied: `Status changed to ${target.label}` };
  }

  // "Nothing to do" is an answer, not a failure — the card says so instead of rendering no buttons.
  if (isInaction(action)) {
    const until = action.followUpAt ? new Date(action.followUpAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
    return { ok: true, applied: until ? `Nothing to do until ${until}` : "Nothing to do on this lead right now" };
  }

  const followUpType = FOLLOW_UP_FOR[action.kind];
  if (followUpType) {
    const dueAt = action.followUpAt ? new Date(action.followUpAt) : defaultDueAt(action);
    await FollowUpService.createFollowUp({
      leadId: lead.id,
      type: followUpType,
      title: action.title,
      description: action.reason || undefined,
      dueAt,
      userId: assignee,
      organizationId,
    });
    return { ok: true, applied: `${followUpTypeLabel(followUpType)} scheduled: ${action.title}` };
  }

  if (action.kind === "enroll_sequence") {
    const rows = await SequenceService.list(organizationId);
    const active = rows.filter((s) => s.isActive && s.stepCount > 0);
    if (active.length === 0) return { ok: false, code: "VALIDATION", message: "There are no active sequences to enroll them in." };
    // Two or more means the choice is the rep's, not ours.
    if (active.length > 1) return { ok: false, code: "VALIDATION", message: `Pick one of the ${active.length} active sequences on the Sequences tab.` };
    const res = await SequenceService.enroll(organizationId, active[0].id, [lead.id]);
    if (!res.enrolled) return { ok: false, code: "CONFLICT", message: `${lead.name || "They"}'s already in ${active[0].name}.` };
    return { ok: true, applied: `Enrolled in ${active[0].name}` };
  }

  if (action.kind === "stop_sequence") {
    const rows = await SequenceService.listForLead(lead.id, organizationId);
    const live = rows.filter((r) => r.status === "active" || r.status === "paused");
    if (live.length === 0) return { ok: false, code: "CONFLICT", message: `${lead.name || "They"}'s not in any sequence right now.` };
    // The action said "stop", not "stop one of them" — stopping every live enrollment is what it means.
    for (const e of live) await SequenceService.stop(organizationId, e.enrollmentId);
    return { ok: true, applied: live.length === 1 ? `Stopped ${live[0].name}` : `Stopped ${live.length} sequences` };
  }

  if (action.kind === "log_meeting_outcome" || action.kind === "confirm_meeting") {
    const meeting = await meetingFor(lead.id, organizationId, action.kind);
    if (!meeting) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: action.kind === "confirm_meeting" ? "There's no upcoming meeting to confirm." : "There's no past meeting to log.",
      };
    }
    // Confirming tells the lead, so it is outbound and goes through the confirmation dialog.
    if (action.kind === "confirm_meeting") {
      if (!input.confirm) return { ok: true, prompt: { kind: "confirm_meeting", meetingId: meeting.id } };
      const res = await sendMeetingConfirmationAction(meeting.id);
      if (!res.ok) return { ok: false, code: res.code, message: res.message };
      return { ok: true, applied: `Confirmation sent for the ${modeLabel(meeting.mode)}` };
    }
    if (!answer?.meetingOutcome) return { ok: true, prompt: { kind: "log_meeting_outcome", meetingId: meeting.id } };
    return applyMeetingOutcome(meeting, answer.meetingOutcome);
  }

  if (action.kind === "assign") {
    if (!answer?.ownerId) return { ok: true, prompt: { kind: "choose_owner" } };
    const res = await assignLeadAction({ leadId: lead.id, ownerId: answer.ownerId, teamId: null });
    if (!res.ok) return { ok: false, code: res.code, message: res.message };
    return { ok: true, applied: "Lead reassigned" };
  }

  if (action.kind === "share_document") {
    if (!answer?.share) return { ok: true, prompt: { kind: "choose_content", title: action.title } };
    const res = await createShareAction({ leadId: lead.id, title: action.title, ...answer.share });
    if (!res.ok) return { ok: false, code: res.code, message: res.message };
    return { ok: true, applied: `Shared: ${action.title}` };
  }

  if (action.kind === "escalate") {
    // Escalation is the SLA scan's job (escalationService), not something a button should stamp.
    return { ok: false, code: "VALIDATION", message: "Overdue leads escalate on their own — nothing to do here." };
  }

  return { ok: false, code: "NOT_FOUND", message: "That suggestion is out of date — refresh the AI recap." };
}

/** No time from the AI: an urgent action lands today, everything else tomorrow, same time of day. */
function defaultDueAt(action: NextAction): Date {
  return new Date(Date.now() + (action.urgency === "now" ? 2 * 3_600_000 : DAY_MS));
}

/** Derived from the action's own words, never a fixed string — the draft dialog lets the rep edit it. */
function emailSubject(action: NextAction): string {
  return action.title.length <= 90 ? action.title : "Following up";
}

/** The meeting an action means: the next one still ahead, or the most recent one already past. */
async function meetingFor(leadId: string, organizationId: string, kind: "confirm_meeting" | "log_meeting_outcome") {
  // listForLead orders by startAt descending, so [0] is the most recent and the last is the furthest ahead.
  const rows = await MeetingService.listForLead(leadId, organizationId);
  const at = (m: (typeof rows)[number]) => new Date(m.startAt).getTime();
  const now = Date.now();
  return kind === "confirm_meeting" ? rows.filter((m) => m.status === "scheduled" && at(m) > now).at(-1) : rows.find((m) => at(m) <= now);
}

async function applyMeetingOutcome(meeting: { id: string; leadId: string; mode: string }, outcome: NonNullable<ExecuteAnswer["meetingOutcome"]>): Promise<ExecuteResult> {
  const res = await setMeetingOutcomeAction(meeting.id, outcome);
  if (!res.ok) return { ok: false, code: res.code, message: res.message };
  const label = { completed: "done", no_show: "marked no-show", cancelled: "cancelled" }[outcome.status];
  return { ok: true, applied: `${modeLabel(meeting.mode)} ${label}` };
}
