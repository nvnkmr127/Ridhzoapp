// Per-webform field schema, stored on lead_sources.config.formFields. Standard keys map to lead
// columns; anything else lands in the lead's custom_data (the generic webhook adapter stuffs
// leftover payload keys there). Pure + testable — the public form, the submit action, and the
// builder all share this.

export type FormFieldType = "text" | "email" | "tel" | "number" | "textarea" | "select" | "date" | "url";
export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  /** Which page of a multi-step form this field appears on (1-based). Single-step forms use 1. */
  step: number;
  /** Choices for a `select` field. Ignored for other types. */
  options?: string[];
}

export const MAX_STEPS = 10;

export const STANDARD_KEYS = ["name", "email", "phone", "company", "message"] as const;
const FIELD_TYPES: FormFieldType[] = ["text", "email", "tel", "number", "textarea", "select", "date", "url"];

export const DEFAULT_FORM_FIELDS: FormField[] = [
  { key: "name", label: "Your name", type: "text", required: true, step: 1 },
  { key: "email", label: "Email", type: "email", required: false, step: 1 },
  { key: "phone", label: "Phone", type: "tel", required: false, step: 1 },
  { key: "message", label: "How can we help?", type: "textarea", required: false, step: 1 },
];

export function isStandard(key: string): boolean {
  return (STANDARD_KEYS as readonly string[]).includes(key);
}

/** Derive a safe custom-field key from a label. Standard keys are preserved as-is. */
export function slugifyKey(label: string): string {
  return (
    label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field"
  );
}

/** Clean untrusted field definitions (from the builder or the DB): drop junk, dedupe keys, cap count. */
export function sanitizeFields(input: unknown): FormField[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: FormField[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = String(r.label ?? "").trim().slice(0, 80);
    if (!label) continue;
    const rawKey = String(r.key ?? "").trim();
    const key = isStandard(rawKey) ? rawKey : slugifyKey(rawKey || label);
    if (seen.has(key)) continue;
    seen.add(key);
    const type = FIELD_TYPES.includes(r.type as FormFieldType) ? (r.type as FormFieldType) : "text";
    const step = Math.min(MAX_STEPS, Math.max(1, Math.floor(Number(r.step)) || 1));
    const options = type === "select" && Array.isArray(r.options)
      ? r.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 50)
      : undefined;
    out.push({ key, label, type, required: Boolean(r.required), step, ...(options ? { options } : {}) });
  }
  return out.slice(0, 20);
}

/**
 * Group fields into ordered steps for a multi-step form. Empty step numbers are collapsed, so
 * fields on steps 1 and 3 (with 2 empty) render as two consecutive pages. Field order is preserved.
 */
export function groupIntoSteps(fields: FormField[]): FormField[][] {
  const byStep = new Map<number, FormField[]>();
  for (const f of fields) {
    const arr = byStep.get(f.step) ?? [];
    arr.push(f);
    byStep.set(f.step, arr);
  }
  return [...byStep.keys()].sort((a, b) => a - b).map((s) => byStep.get(s)!);
}

/** The active fields for a source: its saved schema, or the sensible default when none is set. */
export function resolveFormFields(config: unknown): FormField[] {
  const saved = sanitizeFields((config as { formFields?: unknown } | null)?.formFields);
  return saved.length ? saved : DEFAULT_FORM_FIELDS;
}

/**
 * Server-side validation + mapping of a public submission against a source's real field schema —
 * never trust the client's field list. Returns the cleaned values keyed by field, or an error.
 */
export function buildSubmission(
  fields: FormField[],
  input: Record<string, unknown>,
): { ok: false; error: string } | { ok: true; values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const v = String(input[field.key] ?? "").trim().slice(0, 2000);
    if (field.required && !v) return { ok: false, error: `${field.label} is required.` };
    // A select must hold one of its configured choices (never trust the client's posted value).
    if (v && field.type === "select" && field.options?.length && !field.options.includes(v)) {
      return { ok: false, error: `${field.label} must be one of: ${field.options.join(", ")}.` };
    }
    if (v) values[field.key] = v;
  }
  // Pipeline invariant: a lead must be reachable.
  if (!values.email && !values.phone) {
    return { ok: false, error: "Please provide an email or phone number so we can reach you." };
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, values };
}
