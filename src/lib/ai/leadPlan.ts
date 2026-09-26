// The structured half of the AI lead brief: alongside the recap text, the same AI call proposes
//   • custom-field values it found in the conversation/notes (with the quote that backs each one),
//   • a status change, from the workspace's own status list,
//   • one concrete next step (call / message / meeting / follow-up, with a draft and a time).
// Nothing is applied automatically — the rep accepts or dismisses each suggestion on the profile.
// Pure: the model's JSON is untrusted, so everything is validated here against the workspace's real
// fields and statuses before it's stored or shown. Unit-tested in leadPlan.test.ts.

export type NextStepKind = "call" | "whatsapp" | "email" | "meeting" | "follow_up" | "wait";
const NEXT_KINDS: NextStepKind[] = ["call", "whatsapp", "email", "meeting", "follow_up", "wait"];

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
export interface NextStep {
  id: string;
  kind: NextStepKind;
  title: string;
  reason: string;
  message?: string;
  followUpAt?: string;
}
export interface LeadPlan {
  fields: FieldSuggestion[];
  status: StatusSuggestion | null;
  next: NextStep | null;
}

export const EMPTY_PLAN: LeadPlan = { fields: [], status: null, next: null };

export interface PlanFieldDef {
  key: string;
  label: string;
  type: string;
  options: string[];
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
}

const MAX_FIELDS = 5;
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
  if (!json) return { recap: raw.trim(), plan: EMPTY_PLAN };
  const recap = text(json.recap, 600) || raw.trim();
  return { recap, plan: validatePlan(json, input) };
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
    if (!def || !quote || value == null || value === "" || fields.some((f) => f.key === def.key)) continue;
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

  let next: NextStep | null = null;
  if (json.next && typeof json.next === "object") {
    const n = json.next as Record<string, unknown>;
    const kind = NEXT_KINDS.find((k) => k === n.kind);
    const title = text(n.title, 100);
    if (kind && title) {
      const step: NextStep = { id: `n_${hash(`${kind}:${title}`)}`, kind, title, reason: text(n.reason, 240) };
      const message = typeof n.message === "string" ? n.message.trim().slice(0, 1000) : "";
      if (message && (kind === "whatsapp" || kind === "email")) step.message = message;
      if (typeof n.followUpAt === "string") {
        const at = new Date(n.followUpAt);
        const ms = at.getTime() - input.now.getTime();
        if (!Number.isNaN(ms) && ms > 0 && ms <= MAX_FOLLOW_UP_DAYS * 86_400_000) step.followUpAt = at.toISOString();
      }
      next = step;
    }
  }

  return { fields, status, next };
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

/** The output-format instructions for the brief, listing exactly which field and status keys exist. */
export function briefFormatInstructions(input: Pick<PlanInput, "fields" | "statuses" | "currentStatus" | "now">, timezone: string): string {
  const fieldList = input.fields.length
    ? input.fields
        .map((f) => `${f.key} = "${f.label}" [${f.type}${f.options.length ? `: ${f.options.join(" | ")}` : ""}]`)
        .join("\n")
    : "(none)";
  const statusList = input.statuses.map((s) => `${s.key} = "${s.label}"${s.key === input.currentStatus ? " (current)" : ""}`).join("\n");
  return `Return ONLY a JSON object, no prose, no code fences:
{
  "recap": "one or two short sentences: what the lead wants, where things stand now, the single most useful next step",
  "fields": [{"key": "<field key>", "value": <value>, "evidence": "<short exact quote from the lead's messages, notes, calls or answers>"}],
  "status": {"key": "<status key>", "reason": "<why, citing what happened>"} or null,
  "next": {"kind": "call|whatsapp|email|meeting|follow_up|wait", "title": "<short action>", "reason": "<why now>", "message": "<ready-to-send text, only for whatsapp/email>", "followUpAt": "<ISO datetime with offset, when to do it>"} or null
}
Rules:
- fields: only when the context clearly states the value and the field is empty or now different. Use the field's key, a value valid for its type (one of its options for select; an array of options for multiselect; true/false for checkbox; YYYY-MM-DD for date; a plain number for number). Never guess — no quote, no suggestion. Empty list if nothing.
- status: only if what happened clearly means the lead is now in a different status from the list; otherwise null.
- next: the one best step now, consistent with the current status, pending follow-ups, upcoming meetings and the status playbook. followUpAt must be in the future (today is ${input.now.toISOString().slice(0, 10)}, timezone ${timezone}).
Custom fields you may fill (key = label [type: options]):
${fieldList}
Statuses (key = label):
${statusList}`;
}
