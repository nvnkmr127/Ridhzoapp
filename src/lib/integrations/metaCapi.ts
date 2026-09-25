import crypto from "crypto";

// Meta Conversions API — server-side event delivery. Meta requires PII in user_data to be
// normalized then SHA-256 hashed (hex); pixel id + access token identify the destination. Pure
// builders here so the hashing/payload shape is unit-tested; the POST is a thin wrapper.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api

export interface CapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
  apiVersion?: string; // defaults to a known-good version
}

export interface CapiLead {
  id: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  value?: number | null;
  currency?: string | null;
}

const DEFAULT_API_VERSION = "v20.0";

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

/** Meta normalization: trim + lowercase, then hash. Empty in → undefined (never hash ""). */
export function hashEmail(email?: string | null): string | undefined {
  const v = (email ?? "").trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

/** Phone: strip everything but digits (keep country code), then hash. */
export function hashPhone(phone?: string | null): string | undefined {
  const v = (phone ?? "").replace(/\D/g, "");
  return v ? sha256(v) : undefined;
}

/** Split a full name into hashed first/last per Meta's fn/ln fields. */
function hashName(name?: string | null): { fn?: string; ln?: string } {
  const parts = (name ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const fn = sha256(parts[0]);
  const ln = parts.length > 1 ? sha256(parts[parts.length - 1]) : undefined;
  return { fn, ...(ln ? { ln } : {}) };
}

/** Build one CAPI event. event_id lets Meta dedupe against a browser pixel event for the same lead. */
export function buildEvent(
  eventName: string,
  lead: CapiLead,
  opts: { eventTime?: number; actionSource?: string } = {},
): Record<string, unknown> {
  const user_data: Record<string, unknown> = {};
  const em = hashEmail(lead.email);
  const ph = hashPhone(lead.phone);
  const { fn, ln } = hashName(lead.name);
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (fn) user_data.fn = [fn];
  if (ln) user_data.ln = [ln];

  const custom_data: Record<string, unknown> = {};
  if (typeof lead.value === "number" && lead.value > 0) {
    custom_data.value = lead.value;
    custom_data.currency = (lead.currency || "USD").toUpperCase();
  }

  return {
    event_name: eventName,
    event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: `${lead.id}:${eventName}`,
    action_source: opts.actionSource ?? "system_generated",
    user_data,
    ...(Object.keys(custom_data).length ? { custom_data } : {}),
  };
}

/**
 * Build a CRM lead-stage event for Meta's Conversion Leads integration. Unlike a standard CAPI
 * event, attribution here is by the Facebook `lead_id` (the leadgen id) rather than hashed PII, so
 * Meta can tie a CRM stage change back to the exact ad that produced the lead and optimise for
 * lead *quality*. The id is sent as a string to avoid precision loss on large ids.
 * Docs: https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration
 */
export function buildCrmLeadEvent(
  eventName: string,
  opts: { leadgenId: string; crmName: string; eventTime?: number; value?: number | null; currency?: string | null },
): Record<string, unknown> {
  const custom_data: Record<string, unknown> = {
    event_source: "crm",
    lead_event_source: opts.crmName,
  };
  if (typeof opts.value === "number" && opts.value > 0) {
    custom_data.value = opts.value;
    custom_data.currency = (opts.currency || "USD").toUpperCase();
  }
  return {
    event_name: eventName,
    event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
    // One report per lead per stage: a lead bouncing back into a status must not double-count.
    event_id: `${opts.leadgenId}:${eventName}`,
    action_source: "system_generated",
    // Meta attributes the CRM event via the leadgen id, not hashed PII.
    user_data: { lead_id: String(opts.leadgenId) },
    custom_data,
  };
}

/** POST events to Meta, surfacing Meta's error text. `ok` is true on 2xx. Never throws. */
export async function postEventsDetailed(
  config: CapiConfig,
  events: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  const version = config.apiVersion || DEFAULT_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${config.pixelId}/events`;
  const body: Record<string, unknown> = { data: events, access_token: config.accessToken };
  if (config.testEventCode) body.test_event_code = config.testEventCode;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: j?.error?.message || `Meta returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}

/** Best-effort fire-and-forget delivery. Returns true on 2xx. Never throws. */
export async function postEvents(config: CapiConfig, events: Record<string, unknown>[]): Promise<boolean> {
  return (await postEventsDetailed(config, events)).ok;
}
