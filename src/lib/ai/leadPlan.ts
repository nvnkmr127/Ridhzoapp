// The structured half of the AI lead brief: alongside the recap text, the same AI call proposes
//   • custom-field values it found in the conversation/notes (with the quote that backs each one),
//   • a status change, from the workspace's own status list,
//   • one concrete next action, in the same vocabulary the rule engine speaks (`nextAction.ts`),
//     with a draft message and a time where the kind needs them.
// Nothing is applied automatically — the rep accepts or dismisses each suggestion on the profile.
// Pure: the model's JSON is untrusted, so everything is validated here against the workspace's real
// fields, statuses and lead capabilities before it's stored or shown. Unit-tested in leadPlan.test.ts.

import { z } from "zod";
import { MESSAGE_KINDS, NEXT_ACTION_KINDS, nextActionId, type NextAction, type NextActionKind } from "@/domains/leads/nextAction";

export type { NextAction, NextActionKind } from "@/domains/leads/nextAction";
/** Kept so existing importers keep compiling; the two names were the point of this change. */
export type NextStep = NextAction;

export interface FieldSuggestion {
  id: string;
  key: string;
  label: string;
  /** Value as it will be stored (already coerced by the field's own validation). */
  value: unknown;
  display: string;
  evidence: string;
}
export interface StatusSuggestion {
  id: string;
  key: string;
  label: string;
  reason: string;
}
export interface LeadPlan {
  fields: FieldSuggestion[];
  status: StatusSuggestion | null;
  next: NextAction | null;
}

export const EMPTY_PLAN: LeadPlan = { fields: [], status: null, next: null };

export interface PlanFieldDef {
  key: string;
  label: string;
  type: string;
  options: string[];
}

/**
 * What the rep can actually do on this lead right now.
 *
 * The prompt only ever teaches the kinds these allow, so an impossible action is never proposed in the
 * first place; `validateNextAction` then re-checks independently, because a prompt instruction is not
 * something to rely on. Every flag is optional and defaults to "unknown" (permissive), so a caller
 * that doesn't know yet is never silently robbed of a suggestion.
 */
export interface PlanCapabilities {
  /** Reachable on WhatsApp / by phone. Gates `call` and `whatsapp`. */
  phone?: boolean;
  email?: boolean;
  /** The lead is in a sequence — otherwise there's nothing to stop. */
  inSequence?: boolean;
  /** The workspace has an active sequence this lead could join. */
  hasEnrollableSequence?: boolean;
  /** Something has already been shared with this lead, so re-sharing is meaningful. */
  shareableContent?: boolean;
  /** A meeting is booked and still ahead of us. */
  upcomingMeeting?: boolean;
  /** A meeting happened and was never closed out. */
  unloggedMeeting?: boolean;
  /** The lead already has an owner. */
  hasOwner?: boolean;
}

export interface PlanInput {
  /** Fields the AI may fill: active, non-admin-only definitions. */
  fields: PlanFieldDef[];
  /** The lead's stored custom data (to skip suggestions that change nothing). */
  current: Record<string, unknown>;
  /** Coerces a raw value with the field's own validation; undefined = invalid for that field. */
  coerce: (key: string, value: unknown) => unknown;
  statuses: { key: string; label: string }[];
  currentStatus: string;
  now: Date;
  capabilities?: PlanCapabilities;
  /**
   * Set when reaching out to this lead *right now* would be wrong, phrased as the reason to show —
   * "you already have a follow-up booked for Friday", "you called them 20 minutes ago".
   *
   * Deterministic, from the lead row and the rule engine. The model is shown these same facts as
   * prose and reliably talks past them, so the veto lives here where it cannot be argued with. The
   * AI's contacting action is downgraded rather than dropped: the model still gets to say what is
   * worth saying, just not to claim it should happen immediately.
   */
  holdOutreach?: string | null;
}

const MAX_FIELDS = 5;
// "Not provided" is the model reporting a gap, not a value to save.
const PLACEHOLDER = /^(not (provided|specified|mentioned|available|filled|known)|unknown|n\/?a|none|null|nil|-+|tbd|missing)\.?$/i;
const MAX_FOLLOW_UP_DAYS = 60;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || String(a ?? "").trim() === String(b ?? "").trim();

function display(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

// Stable ids so a dismissed suggestion stays dismissed when the AI proposes it again.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Extracts the JSON object from a model reply (tolerates code fences / stray prose). */
function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Turns the model's reply into { recap, plan }. If the reply isn't JSON (a weaker model ignoring the
 * format), the whole reply is used as the recap and no suggestions are made.
 */
export function parseLeadBrief(raw: string, input: PlanInput): { recap: string; plan: LeadPlan } {
  const json = extractJson(raw);
  if (!json) {
    // A short plain reply is a usable recap. A long one is the model thinking out loud (cut off at the
    // token limit): slicing it would pin half a sentence on the lead, so callers show the fallback instead.
    const prose = raw.trim();
    return { recap: prose.length > 600 ? BROKEN_RECAP : recapFromBrokenJson(raw), plan: EMPTY_PLAN };
  }
  // Never show raw JSON to the rep: if "recap" is missing, the reply isn't a usable brief.
  const recap = text(json.recap, 600) || recapFromBrokenJson(raw);
  return { recap, plan: validatePlan(json, input) };
}

/** What a reply we couldn't read turns into. Callers must not save it as the lead's recap. */
export const BROKEN_RECAP = "Couldn't read the AI's summary this time — tap Refresh to try again.";

// A reply that looks like JSON but doesn't parse (cut off at the token limit, trailing commas…) must not
// land on the profile as `{"recap": "...` — pull the recap string out if it's there, else say so.
function recapFromBrokenJson(raw: string): string {
  const t = raw.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  if (!/^[{[]/.test(t)) return t.slice(0, 600);
  const m = t.match(/"recap"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) {
    try {
      return text(JSON.parse(`"${m[1]}"`), 600);
    } catch {
      /* fall through */
    }
  }
  return BROKEN_RECAP;
}

export function validatePlan(json: Record<string, unknown>, input: PlanInput): LeadPlan {
  const defs = new Map(input.fields.map((f) => [f.key, f]));

  const fields: FieldSuggestion[] = [];
  for (const item of Array.isArray(json.fields) ? json.fields : []) {
    if (!item || typeof item !== "object" || fields.length >= MAX_FIELDS) continue;
    const { key, value, evidence } = item as Record<string, unknown>;
    const def = typeof key === "string" ? defs.get(key) : undefined;
    const quote = text(evidence, 200);
    // Must be a real field, backed by a quote, and not already chosen for this field.
    if (!def || !quote || value == null || value === "" || (typeof value === "string" && PLACEHOLDER.test(value.trim())) || fields.some((f) => f.key === def.key)) continue;
    const coerced = input.coerce(def.key, value);
    if (coerced === undefined || coerced === null || coerced === "") continue;
    if (same(coerced, input.current[def.key])) continue;
    fields.push({ id: `f_${hash(`${def.key}=${JSON.stringify(coerced)}`)}`, key: def.key, label: def.label, value: coerced, display: display(coerced), evidence: quote });
  }

  let status: StatusSuggestion | null = null;
  if (json.status && typeof json.status === "object") {
    const { key, reason } = json.status as Record<string, unknown>;
    const target = typeof key === "string" ? input.statuses.find((s) => s.key === key) : undefined;
    const why = text(reason, 200);
    if (target && target.key !== input.currentStatus && why) {
      status = { id: `s_${hash(target.key)}`, key: target.key, label: target.label, reason: why };
    }
  }

  const next = validateNextAction(json.next, input);
  return { fields, status, next };
}

/** Kinds that need a real status to move to. `change_status` names one; the others imply theirs. */
const STATUS_TARGET_KINDS: NextActionKind[] = ["change_status", "qualify", "mark_qualified", "mark_unqualified"];

/** Which of the workspace's statuses each of those kinds means, when the model didn't name one. */
const STATUS_PATTERN: Partial<Record<NextActionKind, RegExp>> = {
  qualify: /qualif|hot|enquir|interest/i,
  mark_qualified: /qualif|hot|enquir|interest/i,
  mark_unqualified: /unqualif|reject|lost|not\s?interested|drop|invalid|cold/i,
};

/** Per-kind impossibility: a suggestion the lead cannot physically act on is dropped, not shown. */
const IMPOSSIBLE: Partial<Record<NextActionKind, (c: Required<PlanCapabilities>) => boolean>> = {
  call: (c) => !c.phone,
  whatsapp: (c) => !c.phone,
  email: (c) => !c.email,
  enroll_sequence: (c) => !c.hasEnrollableSequence,
  stop_sequence: (c) => !c.inSequence,
  share_document: (c) => !c.shareableContent,
  confirm_meeting: (c) => !c.upcomingMeeting,
  log_meeting_outcome: (c) => !c.unloggedMeeting,
};

/** Urgency, least to most urgent. The model may name one; the confidence gate can only lower it. */
const URGENCY_RANK = { this_week: 0, today: 1, now: 2 } as const;
type Urgency = keyof typeof URGENCY_RANK;

function lowerUrgency(u: Urgency): Urgency {
  return u === "now" ? "today" : "this_week";
}

/**
 * Turns the model's proposed next action into a real `NextAction`, or nothing.
 *
 * Three checks the prompt cannot be trusted with, all deterministic:
 *
 * 1. **Impossibility** — no phone for `call`, no email for `email`, nothing to stop for
 *    `stop_sequence`, no status to move to when it's already there. A button that cannot work is
 *    worse than no button, because the rep discovers it by pressing it.
 * 2. **Outreach veto** — if the lead row or the rule engine says reaching out right now is wrong,
 *    a contacting action is downgraded to `this_week` with the reason shown, not silently trusted
 *    and not thrown away.
 * 3. **Confidence gate** — confidence is *derived*, not believed: a reason with no concrete detail
 *    and no quote behind it can't be presented as a primary button. Low confidence also lowers
 *    urgency, and the UI renders it as advisory rather than as the thing to do next.
 */
export function validateNextAction(raw: unknown, input: PlanInput): NextAction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const n = raw as Record<string, unknown>;
  const kind = NEXT_ACTION_KINDS.find((k) => k === n.kind);
  const title = text(n.title, 100);
  if (!kind || !title) return null;

  // Absent capability data means "unknown", not "no" — don't drop a suggestion we simply can't check.
  const caps: Required<PlanCapabilities> = { ...defaults(), ...input.capabilities };

  if (IMPOSSIBLE[kind]?.(caps)) return null;

  // A status move needs a status that exists here and isn't where the lead already is.
  let statusKey: string | undefined;
  if (STATUS_TARGET_KINDS.includes(kind)) {
    const named = typeof n.statusKey === "string" ? input.statuses.find((s) => s.key === n.statusKey) : undefined;
    const pattern = STATUS_PATTERN[kind];
    const inferred = !named && pattern ? input.statuses.find((s) => pattern.test(s.key) || pattern.test(s.label)) : undefined;
    const target = named ?? inferred;
    if (!target || target.key === input.currentStatus) return null;
    statusKey = target.key;
  }

  const evidence = Array.isArray(n.evidence) ? n.evidence.map((e) => text(e, 160)).filter(Boolean).slice(0, 3) : [];
  const reason = text(n.reason, 240);
  const requested = URGENCY_RANK[n.urgency as Urgency] === undefined ? null : (n.urgency as Urgency);

  const confidence = deriveConfidence({ kind, reason, evidence, hold: input.holdOutreach });
  let urgency: Urgency = requested ?? "today";
  const notes: string[] = [];

  // (2) Outreach veto — downgraded, not dropped, and the rep is told why.
  const hold = input.holdOutreach;
  if (hold && CONTACTING.has(kind) && urgency !== "this_week") {
    urgency = "this_week";
    notes.push(hold);
  }
  // (3) Low confidence is advisory, so it can't claim "now" either.
  if (confidence === "low" && urgency !== "this_week") {
    urgency = lowerUrgency(urgency);
  }

  const action: NextAction = {
    id: nextActionId(kind, title),
    kind,
    title,
    reason: [reason, ...notes].filter(Boolean).join(" ").slice(0, 400),
    evidence,
    urgency,
    confidence,
    source: "ai",
  };
  if (statusKey) action.statusKey = statusKey;
  const message = typeof n.message === "string" ? n.message.trim().slice(0, 1000) : "";
  if (message && MESSAGE_KINDS.includes(kind)) action.message = message;
  if (typeof n.followUpAt === "string") {
    const at = new Date(n.followUpAt);
    const ms = at.getTime() - input.now.getTime();
    if (!Number.isNaN(ms) && ms > 0 && ms <= MAX_FOLLOW_UP_DAYS * 86_400_000) action.followUpAt = at.toISOString();
  }
  return action;
}

/** Kinds that reach out to a human — the only ones the outreach veto applies to. */
const CONTACTING = new Set<NextActionKind>(["call", "whatsapp", "email", "meeting"]);

/**
 * Confidence from what the model actually supplied, never from what it claimed. A reason is only
 * "concrete" if it names a number, a date, or something the lead actually said.
 */
function deriveConfidence(args: { kind: NextActionKind; reason: string; evidence: string[]; hold: string | null | undefined }): NextAction["confidence"] {
  let score = 0;
  if (args.evidence.length) score += 1;
  if (/\d|₹|rs\.?|\b\d{1,2}\s?(am|pm)\b/i.test(args.reason)) score += 1;
  // A reason that just restates the action ("Call the lead") cites nothing.
  if (args.reason.length >= 40) score += 1;
  // Nothing here is ever presented as confident while the lead row already said otherwise.
  if (args.hold && CONTACTING.has(args.kind)) score -= 1;
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

/**
 * The shape we ask the model for, so generation is schema-constrained instead of JSON-by-request.
 *
 * Deliberately loose at the edges. A hard schema would reject the whole brief because one field's
 * value failed — but every one of those rejections is already handled here by `validatePlan` (a value
 * its field won't take, an unknown status, an impossible follow-up date). What the schema buys is
 * the thing that was genuinely fragile: a `recap` that is always a string and `fields` that is always
 * an array, with no code fences, no prose and no regex extraction in between.
 *
 * Defaults make every part optional, so a model that simply omits `status` costs nothing.
 */
export const leadBriefSchema = z.object({
  recap: z.string(),
  fields: z
    .array(z.object({ key: z.string(), value: z.unknown(), evidence: z.string() }))
    .default([]),
  status: z.object({ key: z.string(), reason: z.string() }).nullable().default(null),
  next: z
    .object({
      kind: z.string().describe(`One of: ${NEXT_ACTION_KINDS.join(", ")}`),
      title: z.string(),
      reason: z.string().default(""),
      evidence: z.array(z.string()).default([]),
      urgency: z.string().default("today"),
      message: z.string().optional(),
      statusKey: z.string().optional(),
      followUpAt: z.string().optional(),
    })
    .nullable()
    .default(null),
});

/** Validates an object that already matched `leadBriefSchema` — same rules as the text path. */
export function planFromObject(brief: unknown, input: PlanInput): { recap: string; plan: LeadPlan } {
  const o = (brief && typeof brief === "object" ? brief : {}) as Record<string, unknown>;
  const recap = text(o.recap, 600);
  return { recap: recap || BROKEN_RECAP, plan: validatePlan(o, input) };
}

/** Drops suggestions the rep already applied or dismissed. */
export function visiblePlan(plan: LeadPlan | null | undefined, dismissed: readonly string[] = []): LeadPlan {
  if (!plan) return EMPTY_PLAN;
  const gone = new Set(dismissed);
  return {
    fields: (plan.fields ?? []).filter((f) => !gone.has(f.id)),
    status: plan.status && !gone.has(plan.status.id) ? plan.status : null,
    next: plan.next && !gone.has(plan.next.id) ? plan.next : null,
  };
}

/** What each kind means, in the model's own terms — a bare union teaches nothing about the edges. */
const KIND_GUIDE: Record<NextActionKind, string> = {
  call: "call them on the phone",
  whatsapp: "send them a WhatsApp message",
  email: "email them",
  meeting: "book a call, site visit or meeting",
  follow_up: "set a follow-up for later",
  share_document: "send them a link or document they already engaged with",
  enroll_sequence: "put them on an automated sequence",
  stop_sequence: "stop the automated messages they are receiving",
  change_status: "move them to a different status",
  assign: "hand them to another owner",
  escalate: "flag them to a manager as urgent",
  log_meeting_outcome: "record how a past meeting went",
  confirm_meeting: "confirm a meeting they haven't acknowledged",
  ask_for_info: "ask them for something you still don't know",
  qualify: "run the qualification checklist against this lead",
  mark_qualified: "mark them qualified",
  mark_unqualified: "mark them unqualified",
  wait: "there is genuinely nothing to do yet",
  do_nothing: "nothing needs doing on this lead",
};

/** The kinds this lead can actually support. Unanswered capabilities stay in — we don't drop on a maybe. */
function allowedKinds(caps: PlanCapabilities): NextActionKind[] {
  return NEXT_ACTION_KINDS.filter((k) => !IMPOSSIBLE[k]?.({ ...defaults(), ...caps }));
}

/** Every capability assumed present when the caller didn't say. "Unknown" must never mean "no". */
function defaults(): Required<PlanCapabilities> {
  return { phone: true, email: true, inSequence: true, hasEnrollableSequence: true, shareableContent: true, upcomingMeeting: true, unloggedMeeting: true, hasOwner: true };
}

/** The output-format instructions for the brief, listing exactly which field and status keys exist. */
export function briefFormatInstructions(input: Pick<PlanInput, "fields" | "statuses" | "currentStatus" | "now" | "capabilities" | "holdOutreach">, timezone: string): string {
  const fieldList = input.fields.length
    ? input.fields
        .map((f) => `${f.key} = "${f.label}" [${f.type}${f.options.length ? `: ${f.options.join(" | ")}` : ""}]`)
        .join("\n")
    : "(none)";
  const statusList = input.statuses.map((s) => `${s.key} = "${s.label}"${s.key === input.currentStatus ? " (current)" : ""}`).join("\n");
  const kinds = allowedKinds(input.capabilities ?? {});
  const kindList = kinds.map((k) => `${k} (${KIND_GUIDE[k]})`).join("; ");
  const statusKinds = kinds.filter((k) => STATUS_TARGET_KINDS.includes(k));
  // The JSON template is belt-and-braces: the primary path constrains generation with
  // `leadBriefSchema`, and this is what the plain-text fallback (and a weaker model) reads instead.
  return `Return ONLY a JSON object, no prose, no code fences:
{
  "recap": "at most two short sentences (under 45 words): what the lead wants, where things stand now, the single most useful next step",
  "fields": [{"key": "<field key>", "value": <value>, "evidence": "<short exact quote from the lead's messages, notes, calls or answers>"}],
  "status": {"key": "<status key>", "reason": "<why, citing what happened>"} or null,
  "next": {"kind": "<one kind>", "title": "<short action, under 60 characters>", "reason": "<why now, citing something concrete that happened>", "evidence": ["<short exact quote that supports it>"], "urgency": "now|today|this_week", "message": "<ready-to-send text, only for whatsapp/email>", "statusKey": "<status key, only for ${statusKinds.join("/") || "change_status"}>", "followUpAt": "<ISO datetime with offset, when to do it>"} or null
}
Rules:
- fields: only when the context clearly states the value and the field is empty or now different. Use the field's key, a value valid for its type (one of its options for select; an array of options for multiselect; true/false for checkbox; YYYY-MM-DD for date; a plain number for number). Never guess — no quote, no suggestion. Never suggest a field that is already filled with the same information, and never a placeholder like "Not provided". Keep each evidence quote under 12 words. At most 3 fields; empty list if nothing.
- status: only if what happened clearly means the lead is now in a different status from the list; otherwise null.
- next: exactly ONE next action, and only these kinds are possible for this lead:
  ${kindList}
  Pick it because something concrete happened — not because it is time to check in. ${input.holdOutreach ? `Do NOT propose contacting them right now: ${input.holdOutreach}` : ""} If nothing has actually happened and a follow-up or meeting is already pending, "wait" is the correct answer and a good one — say so rather than inventing a task.
- reason: name the fact, not the feeling. "Asked twice about the EMI on the Honda City, both times unanswered" beats "engaged lead". Cite a number, a date, or a quote. No evidence quote in the context means no invented one.
- evidence: verbatim words from this lead's messages, notes or answers — never your own paraphrase. Empty list if there is nothing to quote.
- urgency: "now" only when something is genuinely time-critical today (a deadline they gave, a booking that expires). "this_week" otherwise. Never "now" just because the lead is warm.
- message: only for whatsapp and email, and only text you can support from the context — no invented prices, offers, dates or details.
- followUpAt: must be in the future (today is ${input.now.toISOString().slice(0, 10)}, timezone ${timezone}).
Custom fields you may fill (key = label [type: options]):
${fieldList}
Statuses (key = label):
${statusList}`;
}
