import { LeadSourceAdapter, NormalizedLeadPayload } from "../types";

export class FacebookLeadAdsAdapter implements LeadSourceAdapter {
  providerName = "facebook_lead_ads";

  async normalize(
    rawPayload: any,
    sourceId: string,
    teamId?: string,
    ownerId?: string
  ): Promise<NormalizedLeadPayload> {
    // Single source of truth for Facebook field → lead mapping. Delegating (instead of a second,
    // divergent parser here) means every Facebook ingestion path — the inline webhook, the worker,
    // historical sync, and this generic-webhook adapter — writes identical customData (the meta_*
    // attribution keys the lead UI reads, plus leadSource).
    const { FacebookLeadMappingService } = await import("@/domains/leads/facebookLeadMappingService");
    // Honor the source's saved field mappings so this path writes the same customData as the others.
    const { LeadSourceService } = await import("@/domains/leads/sourceService");
    const source = await LeadSourceService.getSource(sourceId).catch(() => null);
    const fieldMappings = Array.isArray((source?.config as any)?.fieldMappings)
      ? (source!.config as any).fieldMappings
      : undefined;
    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(rawPayload, fieldMappings);

    return {
      name: mapped.name,
      email: mapped.email || undefined,
      phone: mapped.phone || undefined,
      expectedValue: mapped.expectedValue,
      externalId: mapped.facebookLeadgenId || rawPayload.id,
      sourceId,
      teamId,
      ownerId,
      customData: { ...mapped.customData, leadSource: mapped.source },
    };
  }
}
