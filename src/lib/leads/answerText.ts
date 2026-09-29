// Lead-form answers arrive in machine form: Meta sends multiple-choice answers as slugs
// ("₹40-75_lakhs_", "yes"). Clean them for people, and match them to a select field's options.

/** "₹40-75_lakhs_" → "₹40-75 lakhs". Only touches single-token, underscore-slug values — never emails, URLs, or free text. */
export function cleanFormAnswer(v: string): string {
  const t = v.trim();
  if (!t.includes("_") || /[\s@/:]/.test(t)) return t;
  return t.replace(/_+/g, " ").trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, " ").trim();

/** The option that equals `value` ignoring case, spaces and underscores ("yes" → "Yes"), or undefined. */
export function matchOption(options: readonly string[], value: unknown): string | undefined {
  const v = String(value ?? "");
  return options.includes(v) ? v : options.find((o) => norm(o) === norm(v));
}
