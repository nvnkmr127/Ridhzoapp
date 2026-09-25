import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";
import { TenantIntegrationsService, type EnrichmentConfig } from "@/domains/organizations/tenantIntegrationsService";

// Lead enrichment: fetch observed facts about a lead (company, title, socials …) from an external
// data provider and record them as EVIDENCE, not truth. The provider is configured PER TENANT
// (Settings → Lead Intelligence), not via env — a tenant with none set is an honest no-op.
//
// Evidence discipline (borrowed from the agentic-CRM approach): the provider reports what it
// *observed*, stored verbatim under `customData._enrichment`. A strong field (company) fills the
// real column ONLY when the human left it blank — an enriched guess never overwrites entered data.

export interface EnrichmentResult {
  source: string;
  attributes: Record<string, unknown>;
}

export interface EnrichmentInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

export type ProviderResult =
  | { ok: true; result: EnrichmentResult }
  | { ok: false; reason: string; retryable: boolean };

// Stored verbatim in customData, so cap it — a provider dumping megabytes must not bloat the row.
const MAX_ATTRIBUTES_BYTES = 20_000;

/**
 * Calls the tenant's configured enrichment provider. Never throws: a miss or failure comes back as
 * { ok: false } with `retryable` set for transient errors (network, timeout, 429, 5xx) so the
 * worker can hand those to BullMQ's retry. The request/response mapping below is the ONE place
 * to adapt to a specific vendor — reshape `attributes` here if their JSON differs.
 * ponytail: generic POST contract, swap for a vendor SDK's field mapping if one provider wins.
 */
export async function callProvider(input: EnrichmentInput, config: EnrichmentConfig): Promise<ProviderResult> {
  if (!input.email && !input.company) return { ok: false, reason: "nothing to look up", retryable: false };

  // The URL is tenant-supplied and fetched from our server: refuse private/metadata addresses.
  try {
    const { assertPublicHttpUrl } = await import("@/lib/webhooks/ssrf");
    await assertPublicHttpUrl(config.url);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Blocked URL", retryable: false };
  }

  let res: Response;
  try {
    res = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json", [config.authHeader]: config.authValue },
      body: JSON.stringify({ email: input.email, company: input.company, name: input.name, phone: input.phone }),
      signal: AbortSignal.timeout(config.timeoutMs),
      redirect: "manual", // a public URL must not 302 us into the internal network
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, reason: timedOut ? "provider timed out" : "couldn't reach provider", retryable: true };
  }

  if (res.status === 404) return { ok: false, reason: "no match", retryable: false };
  if (res.status === 429 || res.status >= 500) return { ok: false, reason: `provider returned HTTP ${res.status}`, retryable: true };
  if (!res.ok) return { ok: false, reason: `provider returned HTTP ${res.status}`, retryable: false };

  const text = await res.text().catch(() => "");
  if (text.length > MAX_ATTRIBUTES_BYTES) return { ok: false, reason: "provider response too large", retryable: false };
  let attributes: unknown;
  try {
    attributes = JSON.parse(text);
  } catch {
    return { ok: false, reason: "provider didn't return JSON", retryable: false };
  }
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes) || Object.keys(attributes).length === 0) {
    return { ok: false, reason: "no match", retryable: false };
  }
  return { ok: true, result: { source: new URL(config.url).host, attributes: attributes as Record<string, unknown> } };
}

/**
 * Pure evidence patch: the observation to store under customData._enrichment, plus the company the
 * provider observed (applied by the caller only when the lead's company is blank).
 */
export function enrichmentPatch(
  result: EnrichmentResult,
  now: Date = new Date(),
): { evidence: { source: string; fetchedAt: string; attributes: Record<string, unknown> }; company: string | null } {
  const observed = result.attributes.company ?? result.attributes.companyName;
  const company = typeof observed === "string" && observed.trim() ? observed.trim() : null;
  return { evidence: { source: result.source, fetchedAt: now.toISOString(), attributes: result.attributes }, company };
}

/** True when a lead is worth (re-)enriching: has something to look up and isn't already enriched. */
export function needsEnrichment(lead: { email: string | null; company: string | null; customData: unknown }): boolean {
  const already = Boolean((lead.customData as { _enrichment?: unknown } | null)?._enrichment);
  return !already && Boolean(lead.email || lead.company);
}

export class EnrichmentService {
  /**
   * Enrich one lead in place. Safe to call for any lead; no-op when the tenant has no provider or
   * the lead is already enriched. Throws on a transient provider error so BullMQ retries it.
   */
  static async enrichLead(leadId: string): Promise<{ status: "enriched" | "skipped"; reason?: string }> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { status: "skipped", reason: "lead_not_found" };
    if (!needsEnrichment(lead)) return { status: "skipped", reason: "already_enriched_or_empty" };

    const config = await TenantIntegrationsService.getEnrichmentConfig(lead.organizationId);
    if (!config) return { status: "skipped", reason: "provider_not_configured" };

    const res = await callProvider(
      { name: lead.name, email: lead.email, phone: lead.phone, company: lead.company },
      config,
    );
    if (!res.ok) {
      if (res.retryable) throw new Error(`Enrichment failed: ${res.reason}`);
      return { status: "skipped", reason: res.reason };
    }

    // Merge in SQL, not read-modify-write: the provider call can take seconds, and a rep editing
    // custom fields meanwhile must not be clobbered. Company fills only when still blank.
    const { evidence, company } = enrichmentPatch(res.result);
    await db
      .update(leads)
      .set({
        customData: sql`coalesce(${leads.customData}, '{}'::jsonb) || ${JSON.stringify({ _enrichment: evidence })}::jsonb`,
        ...(company ? { company: sql`case when coalesce(trim(${leads.company}), '') = '' then ${company} else ${leads.company} end` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    await ActivityService.addActivity({
      leadId,
      type: "note",
      content: `Lead enriched from ${res.result.source}.`,
    });

    return { status: "enriched" };
  }
}
