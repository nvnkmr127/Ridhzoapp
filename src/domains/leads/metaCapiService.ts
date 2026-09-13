import { LeadService } from "./service";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { buildEvent, buildCrmLeadEvent, postEvents, postEventsDetailed } from "@/lib/integrations/metaCapi";

// The CRM name reported to Meta as lead_event_source in Conversion Leads postbacks.
const CRM_NAME = "Ridhzo";

// CRM status → the Meta lead-stage event name reported for Conversion Leads optimisation. Only the
// stages that signal lead quality are worth reporting; the rest are noise. Tenants map these names
// to their funnel in Meta Events Manager. ponytail: static default map; make it per-tenant config
// if orgs need custom stage names.
const STATUS_EVENT_MAP: Record<string, string> = {
  contacted: "contacted",
  qualified: "qualified",
  won: "converted",
};

export function metaEventForStatus(status?: string | null): string | undefined {
  return status ? STATUS_EVENT_MAP[status.toLowerCase()] : undefined;
}

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
  static async trackCrmStage(leadId: string, eventName: string): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(leadId);
      if (!lead?.organizationId) return;

      const fbLeadId = (lead.customData as Record<string, unknown> | null)?.["facebook_lead_id"];
      if (!fbLeadId) return; // not a Meta-sourced lead → nothing to attribute back

      const config = await TenantIntegrationsService.getCapiConfig(lead.organizationId);
      if (!config) return;

      const event = buildCrmLeadEvent(eventName, {
        leadgenId: String(fbLeadId),
        crmName: CRM_NAME,
        value: lead.expectedValue != null ? Number(lead.expectedValue) : null,
      });
      await postEvents(config, [event]);
    } catch {
      // best-effort; a CAPI failure must never affect lead processing
    }
  }

  /** Send a sample event using the saved config (even if not enabled) so a tenant can verify setup. */
  static async sendTest(organizationId: string): Promise<{ ok: boolean; error?: string }> {
    const config = await TenantIntegrationsService.getCapiConfig(organizationId, false);
    if (!config) return { ok: false, error: "Save your Pixel/Dataset ID and access token first." };
    const event = buildEvent("Lead", {
      id: `test-${Date.now()}`,
      email: "test@example.com",
      name: "Test Lead",
    });
    return postEventsDetailed(config, [event]);
  }
}
