export interface NormalizedLeadPayload {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  sourceId: string;
  organizationId?: string;
  externalId?: string; // ID from the external system (e.g., Meta Lead ID)
  expectedValue?: number | null; // e.g. a numeric budget answer → the lead's Opportunity Size
  teamId?: string;
  ownerId?: string;
  customData: Record<string, any>;
}

export interface LeadSourceAdapter {
  providerName: string;
  /**
   * Normalizes an incoming raw payload from an external source into the standard format.
   */
  normalize(rawPayload: any, sourceId: string, teamId?: string, ownerId?: string): Promise<NormalizedLeadPayload>;
  /**
   * Verifies the authenticity of the webhook payload if the provider supports signatures.
   */
  verifySignature?(rawPayload: any, signature: string, secret: string): boolean;
}
