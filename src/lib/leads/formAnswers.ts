// What the LEAD told us — form answers (budget, requirement, "what are you looking for") that sources
// drop into customData — separated from our own bookkeeping and ad attribution. Pure; used by the
// profile's "Lead's answers" card, the AI context and scoring so they all agree on what counts.

// Internal bookkeeping we stash in customData (scoring, ingestion provenance). Never shown as answers.
const INTERNAL_KEYS = new Set(["leadSource", "expectedValue", "facebook_lead_id", "facebook_form_id", "facebook_page_id", "facebook_ad_id"]);
// Ad/campaign attribution — shown in the Lead Source card instead.
const ATTRIBUTION = /^(meta_|utm_)|^(gclid|fbclid|campaign|ad_group|adgroup|keyword|page_url|referrer|form_id|ad_id|adset_id|campaign_id|platform|is_organic)$/i;

export function isInternalKey(key: string): boolean {
  return key.startsWith("_") || INTERNAL_KEYS.has(key);
}

function isAttributionKey(key: string): boolean {
  return ATTRIBUTION.test(key);
}

// "what_is_your_budget?" → "What is your budget?"
export function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

export type FormAnswer = { key: string; label: string; value: string };

/** The lead's own answers, labelled with the org's field labels where defined. */
export function formAnswers(customData: unknown, labels: Record<string, string> = {}): FormAnswer[] {
  if (!customData || typeof customData !== "object") return [];
  const out: FormAnswer[] = [];
  for (const [key, raw] of Object.entries(customData as Record<string, unknown>)) {
    if (isInternalKey(key) || isAttributionKey(key)) continue;
    const value = toText(raw);
    if (!value) continue;
    out.push({ key, label: labels[key] ?? humanizeKey(key), value });
  }
  return out;
}

export function hasFormAnswers(customData: unknown): boolean {
  return formAnswers(customData).length > 0;
}
