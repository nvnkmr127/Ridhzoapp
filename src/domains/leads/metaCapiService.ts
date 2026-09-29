import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { LeadService } from "./service";
import { TenantIntegrationsService, type CapiConfig } from "@/domains/organizations/tenantIntegrationsService";
import { buildEvent, buildCrmLeadEvent, postEvents, postEventsDetailed } from "@/lib/integrations/metaCapi";

// Deal values are in the org's currency; Meta needs to be told which, or it assumes the default.
async function orgCurrency(organizationId: string): Promise<string | null> {
  const [org] = await db
    .select({ currency: organizations.currency })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return org?.currency ?? null;
}

// The CRM name reported to Meta as lead_event_source in Conversion Leads postbacks.
const lastTest = new Map<string, number>();
const CRM_NAME = "Ridhzo";

type LiveConfig = NonNullable<Awaited<ReturnType<typeof TenantIntegrationsService.getCapiConfig>>>;

// Deliver with retries, then log + record the outcome. Never throws (fired from event handlers).
async function deliver(organizationId: string, config: LiveConfig, event: Record<string, unknown>, leadId: string) {
  const res = await postEvents(config, [event]);
  if (res.ok) {
    console.info(`[capi] sent ${event.event_name} lead=${leadId} org=${organizationId} trace=${res.fbtraceId ?? "-"}`);
  } else {
    console.error(
      `[capi] FAILED ${event.event_name} lead=${leadId} org=${organizationId} http=${res.status ?? "-"} code=${res.code ?? "-"} trace=${res.fbtraceId ?? "-"}: ${res.error}`,
    );
  }
  await TenantIntegrationsService.recordCapiDelivery(organizationId, res.ok, res.error);
}

// Sends lead conversion events to the lead's tenant Meta CAPI destination. Best-effort: no config
// = no-op, and it never throws into the caller (fired from event handlers). Transient failures are
// retried in-process (3x, backoff); a permanent failure is logged and shown on the settings page.
export class MetaCapiService {
  static async track(leadId: string, eventName: string): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(leadId);
      if (!lead?.organizationId || lead.deletedAt) return;

      // Meta Lead Ads leads are already counted natively by Meta (and reported by leadgen id via
      // trackCrmStage) — a hashed Lead event would double-count them.
      const isMetaLeadAd = !!(lead.customData as Record<string, unknown> | null)?.["facebook_lead_id"];
      if (eventName === "Lead" && isMetaLeadAd) return;

      const config = await TenantIntegrationsService.getCapiConfig(lead.organizationId);
      if (!config) return;

      const event = buildEvent(eventName, {
        id: lead.id,
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        value: lead.expectedValue != null ? Number(lead.expectedValue) : null,
        currency: await orgCurrency(lead.organizationId),
      });
      await deliver(lead.organizationId, config, event, leadId);
    } catch (e) {
      console.error(`[capi] ${eventName} lead=${leadId} crashed before sending`, e);
    }
  }

  /**
   * Conversion Leads postback: report a CRM lead-stage change to Meta, attributed by the Facebook
   * leadgen id, so Meta can optimise ad delivery toward leads that actually progress/convert.
   * No-op unless the lead came from Meta (has a stored lead id) and the tenant has CAPI configured.
   * `category` (won/lost/…) is the fallback lookup so custom statuses in a category still map.
   */
  static async trackCrmStage(leadId: string, crmStatus: string, category?: string | null): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(leadId);
      if (!lead?.organizationId || lead.deletedAt) return;

      const fbLeadId = (lead.customData as Record<string, unknown> | null)?.["facebook_lead_id"];
      if (!fbLeadId) return; // not a Meta-sourced lead → nothing to attribute back

      // Resolve the CRM status → Meta lead-stage event via the tenant's (or default) map.
      const stageMap = await TenantIntegrationsService.getCapiStageMap(lead.organizationId);
      const eventName = stageMap[(crmStatus ?? "").toLowerCase()] ?? (category ? stageMap[category] : undefined);
      if (!eventName) return; // this status isn't mapped to a reported stage

      const config = await TenantIntegrationsService.getCapiConfig(lead.organizationId);
      if (!config) return;

      const event = buildCrmLeadEvent(eventName, {
        leadgenId: String(fbLeadId),
        crmName: CRM_NAME,
        value: lead.expectedValue != null ? Number(lead.expectedValue) : null,
        currency: await orgCurrency(lead.organizationId),
      });
      await deliver(lead.organizationId, config, event, leadId);
    } catch (e) {
      console.error(`[capi] stage postback lead=${leadId} crashed before sending`, e);
    }
  }

  /**
   * Send a sample event so a tenant can verify setup. Uses the form's values (a blank token falls
   * back to the saved one) and REQUIRES a test event code — without one the fake lead would land in
   * the live dataset and count as a real conversion.
   */
  static async sendTest(
    organizationId: string,
    form: { pixelId: string | null; accessToken?: string; testEventCode: string | null },
  ): Promise<{ ok: boolean; error?: string }> {
    if (!form.testEventCode) return { ok: false, error: "Enter a test event code first, so the test doesn't count as a real lead." };
    const accessToken = form.accessToken || (await TenantIntegrationsService.getSavedSecrets(organizationId)).capiAccessToken;
    if (!form.pixelId || !accessToken) return { ok: false, error: "Enter the Pixel/Dataset ID and access token first." };
    const config: CapiConfig = { pixelId: form.pixelId, accessToken, testEventCode: form.testEventCode };
    // Cooldown so the button can't be used to hammer Meta.
    const last = lastTest.get(organizationId) ?? 0;
    if (Date.now() - last < 5_000) return { ok: false, error: "Wait a few seconds before sending another test." };
    lastTest.set(organizationId, Date.now());
    const event = buildEvent("Lead", {
      id: `test-${Date.now()}`,
      email: "test@example.com",
      name: "Test Lead",
    });
    const res = await postEventsDetailed(config, [event]);
    if (!res.ok) console.error(`[capi] test event failed org=${organizationId} http=${res.status ?? "-"} code=${res.code ?? "-"} trace=${res.fbtraceId ?? "-"}: ${res.error}`);
    return { ok: res.ok, error: res.ok ? undefined : `${res.error}${res.fbtraceId ? ` (Meta trace ${res.fbtraceId})` : ""}` };
  }
}
