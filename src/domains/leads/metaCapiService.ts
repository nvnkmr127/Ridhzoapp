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
const CRM_NAME = "Ridhzo";

// Sends a lead conversion event to the lead's tenant Meta CAPI destination. Best-effort: no config
// = no-op, and it never throws into the caller (fired from event handlers).
// ponytail: fire-once, no retry queue — add one if delivery guarantees matter.
export class MetaCapiService {
  static async track(leadId: string, eventName: string): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(leadId);
      if (!lead?.organizationId) return;

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
      await postEvents(config, [event]);
    } catch {
      // best-effort; a CAPI failure must never affect lead processing
    }
  }

  /**
   * Conversion Leads postback: report a CRM lead-stage change to Meta, attributed by the Facebook
   * leadgen id, so Meta can optimise ad delivery toward leads that actually progress/convert.
   * No-op unless the lead came from Meta (has a stored lead id) and the tenant has CAPI configured.
   */
  static async trackCrmStage(leadId: string, crmStatus: string): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(leadId);
      if (!lead?.organizationId) return;

      const fbLeadId = (lead.customData as Record<string, unknown> | null)?.["facebook_lead_id"];
      if (!fbLeadId) return; // not a Meta-sourced lead → nothing to attribute back

      // Resolve the CRM status → Meta lead-stage event via the tenant's (or default) map.
      const stageMap = await TenantIntegrationsService.getCapiStageMap(lead.organizationId);
      const eventName = stageMap[(crmStatus ?? "").toLowerCase()];
      if (!eventName) return; // this status isn't mapped to a reported stage

      const config = await TenantIntegrationsService.getCapiConfig(lead.organizationId);
      if (!config) return;

      const event = buildCrmLeadEvent(eventName, {
        leadgenId: String(fbLeadId),
        crmName: CRM_NAME,
        value: lead.expectedValue != null ? Number(lead.expectedValue) : null,
        currency: await orgCurrency(lead.organizationId),
      });
      await postEvents(config, [event]);
    } catch {
      // best-effort; a CAPI failure must never affect lead processing
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
    const event = buildEvent("Lead", {
      id: `test-${Date.now()}`,
      email: "test@example.com",
      name: "Test Lead",
    });
    return postEventsDetailed(config, [event]);
  }
}
