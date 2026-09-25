import crypto from "crypto";
import { db } from "@/db";
import { tenantIntegrationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";

// Per-tenant config for lead enrichment + inbound email + Meta CAPI, configured from the frontend.
// Mirrors EmailSettingsService: encrypted secret at rest, a masked view for the UI, and a resolved
// config for the backend. Replaces the platform env vars ENRICHMENT_API_* and EMAIL_INBOUND_SECRET.

export interface TenantIntegrationsView {
  enrichmentEnabled: boolean;
  enrichmentApiUrl: string | null;
  enrichmentAuthHeader: string | null;
  hasEnrichmentAuthValue: boolean;
  inboundEmailEnabled: boolean;
  inboundEmailToken: string | null;
  capiEnabled: boolean;
  capiPixelId: string | null;
  hasCapiAccessToken: boolean;
  capiTestEventCode: string | null;
  capiLeadStageMap: Record<string, string>; // resolved (tenant override or default)
  capiLeadStageMapCustom: boolean; // false = the default map is in effect
}

// Default Conversion Leads mapping: CRM status key → Meta lead-stage event name. Covers the
// built-in keys (active/won) plus the common custom ones (contacted/qualified); keys a tenant
// doesn't have simply never match, and the UI hides them until the tenant customises the map.
// The event names must match Events Manager → Conversion Leads.
export const DEFAULT_CAPI_STAGE_MAP: Record<string, string> = {
  active: "contacted",
  contacted: "contacted",
  qualified: "qualified",
  won: "converted",
};

export interface CapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
}

export interface EnrichmentConfig {
  url: string;
  authHeader: string;
  authValue: string;
  timeoutMs: number;
}

// Form input for a section save. Every visible field is sent: "" / null clears it. Secrets are the
// exception — blank keeps the stored value (use the disconnect action to remove it).
export interface EnrichmentInput {
  enabled: boolean;
  apiUrl: string | null;
  authHeader: string | null;
  authValue?: string;
}

export interface CapiInput {
  enabled: boolean;
  pixelId: string | null;
  accessToken?: string;
  testEventCode: string | null;
}

// Sensible fallbacks used only when a tenant leaves a field blank — not baked-in behaviour.
export const DEFAULT_AUTH_HEADER = "Authorization";
const DEFAULT_TIMEOUT_MS = 10_000;

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url"); // 32 url-safe chars
}

function validation(message: string): Error {
  return Object.assign(new Error(message), { code: "VALIDATION" });
}

type Row = typeof tenantIntegrationSettings.$inferSelect;
type Patch = Partial<Omit<typeof tenantIntegrationSettings.$inferInsert, "id" | "organizationId">>;

export class TenantIntegrationsService {
  static async getRaw(organizationId: string): Promise<Row | null> {
    const [row] = await db
      .select()
      .from(tenantIntegrationSettings)
      .where(eq(tenantIntegrationSettings.organizationId, organizationId))
      .limit(1);
    return row ?? null;
  }

  static toView(row: Row | null): TenantIntegrationsView {
    return {
      enrichmentEnabled: row?.enrichmentEnabled === 1,
      enrichmentApiUrl: row?.enrichmentApiUrl ?? null,
      enrichmentAuthHeader: row?.enrichmentAuthHeader ?? null,
      hasEnrichmentAuthValue: !!row?.enrichmentAuthValueEnc,
      inboundEmailEnabled: row?.inboundEmailEnabled === 1,
      inboundEmailToken: row?.inboundEmailToken ?? null,
      capiEnabled: row?.capiEnabled === 1,
      capiPixelId: row?.capiPixelId ?? null,
      hasCapiAccessToken: !!row?.capiAccessTokenEnc,
      capiTestEventCode: row?.capiTestEventCode ?? null,
      capiLeadStageMap: row?.capiLeadStageMap ?? DEFAULT_CAPI_STAGE_MAP,
      capiLeadStageMapCustom: row?.capiLeadStageMap != null,
    };
  }

  static async getView(organizationId: string): Promise<TenantIntegrationsView> {
    return this.toView(await this.getRaw(organizationId));
  }

  /** Insert-or-update only the given columns; everything else keeps its value (or DB default). */
  private static async patch(organizationId: string, set: Patch): Promise<TenantIntegrationsView> {
    const now = new Date();
    const [row] = await db
      .insert(tenantIntegrationSettings)
      .values({ organizationId, ...set, updatedAt: now })
      .onConflictDoUpdate({ target: tenantIntegrationSettings.organizationId, set: { ...set, updatedAt: now } })
      .returning();
    return this.toView(row);
  }

  /** Resolved Conversion Leads stage map for the backend: tenant override, else the default. */
  static async getCapiStageMap(organizationId: string): Promise<Record<string, string>> {
    const row = await this.getRaw(organizationId);
    return row?.capiLeadStageMap ?? DEFAULT_CAPI_STAGE_MAP;
  }

  /** Save a tenant's Conversion Leads stage map. An empty map means "report no stages". */
  static async upsertCapiStageMap(organizationId: string, map: Record<string, string>): Promise<TenantIntegrationsView> {
    const clean = Object.fromEntries(
      Object.entries(map)
        .map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
        .filter(([k, v]) => k && v),
    );
    return this.patch(organizationId, { capiLeadStageMap: clean });
  }

  /** Save enrichment config. Blank fields clear; a blank secret keeps the stored one. */
  static async upsertEnrichment(organizationId: string, input: EnrichmentInput): Promise<TenantIntegrationsView> {
    const existing = await this.getRaw(organizationId);
    const authValueEnc = input.authValue ? encryptSecret(input.authValue) : existing?.enrichmentAuthValueEnc ?? null;
    if (input.enabled && (!input.apiUrl || !authValueEnc)) {
      throw validation("To turn on enrichment, enter the provider URL and API key.");
    }
    return this.patch(organizationId, {
      enrichmentEnabled: input.enabled ? 1 : 0,
      enrichmentApiUrl: input.apiUrl || null,
      enrichmentAuthHeader: input.authHeader || null,
      enrichmentAuthValueEnc: authValueEnc,
    });
  }

  /** Turn enrichment off and forget the provider + secret. */
  static async clearEnrichment(organizationId: string): Promise<TenantIntegrationsView> {
    return this.patch(organizationId, {
      enrichmentEnabled: 0,
      enrichmentApiUrl: null,
      enrichmentAuthHeader: null,
      enrichmentAuthValueEnc: null,
      enrichmentTimeoutMs: null,
    });
  }

  /** Enable/disable inbound email, minting a token on first enable. */
  static async setInboundEmail(organizationId: string, enabled: boolean): Promise<TenantIntegrationsView> {
    const existing = await this.getRaw(organizationId);
    const token = existing?.inboundEmailToken ?? (enabled ? newToken() : null);
    return this.patch(organizationId, { inboundEmailEnabled: enabled ? 1 : 0, inboundEmailToken: token });
  }

  /** Rotate the inbound token (invalidates the old webhook URL). */
  static async rotateInboundToken(organizationId: string): Promise<TenantIntegrationsView> {
    return this.patch(organizationId, { inboundEmailToken: newToken() });
  }

  /** Save Meta CAPI config. Blank fields clear; a blank access token keeps the stored one. */
  static async upsertCapi(organizationId: string, input: CapiInput): Promise<TenantIntegrationsView> {
    const existing = await this.getRaw(organizationId);
    const tokenEnc = input.accessToken ? encryptSecret(input.accessToken) : existing?.capiAccessTokenEnc ?? null;
    if (input.enabled && (!input.pixelId || !tokenEnc)) {
      throw validation("To turn on Meta Conversions, enter the Pixel/Dataset ID and access token.");
    }
    return this.patch(organizationId, {
      capiEnabled: input.enabled ? 1 : 0,
      capiPixelId: input.pixelId || null,
      capiAccessTokenEnc: tokenEnc,
      capiTestEventCode: input.testEventCode || null,
    });
  }

  /** Turn CAPI off and forget the pixel + token + test code (the stage map is kept). */
  static async clearCapi(organizationId: string): Promise<TenantIntegrationsView> {
    return this.patch(organizationId, { capiEnabled: 0, capiPixelId: null, capiAccessTokenEnc: null, capiTestEventCode: null });
  }

  /**
   * Resolved CAPI config for the backend, or null when incomplete/undecryptable. `requireEnabled`
   * (default) also returns null when the integration is off — pass false to test saved-but-off config.
   */
  static async getCapiConfig(organizationId: string, requireEnabled = true): Promise<CapiConfig | null> {
    const row = await this.getRaw(organizationId);
    if (!row || (requireEnabled && row.capiEnabled !== 1) || !row.capiPixelId || !row.capiAccessTokenEnc) return null;
    const accessToken = decryptSecret(row.capiAccessTokenEnc);
    if (!accessToken) return null;
    return { pixelId: row.capiPixelId, accessToken, testEventCode: row.capiTestEventCode };
  }

  /** Stored secrets for a test run with unsaved form values (blank form secret = use saved). */
  static async getSavedSecrets(organizationId: string): Promise<{ enrichmentAuthValue: string | null; capiAccessToken: string | null }> {
    const row = await this.getRaw(organizationId);
    return {
      enrichmentAuthValue: row?.enrichmentAuthValueEnc ? decryptSecret(row.enrichmentAuthValueEnc) : null,
      capiAccessToken: row?.capiAccessTokenEnc ? decryptSecret(row.capiAccessTokenEnc) : null,
    };
  }

  /** Resolved enrichment config for the backend, or null when off/incomplete/undecryptable. */
  static async getEnrichmentConfig(organizationId: string): Promise<EnrichmentConfig | null> {
    const row = await this.getRaw(organizationId);
    if (!row || row.enrichmentEnabled !== 1 || !row.enrichmentApiUrl || !row.enrichmentAuthValueEnc) return null;
    const authValue = decryptSecret(row.enrichmentAuthValueEnc);
    if (!authValue) return null; // key rotated / corrupt
    return {
      url: row.enrichmentApiUrl,
      authHeader: row.enrichmentAuthHeader || DEFAULT_AUTH_HEADER,
      authValue,
      timeoutMs: row.enrichmentTimeoutMs || DEFAULT_TIMEOUT_MS,
    };
  }

  /** Resolve the org for an inbound-email webhook token. Null when unknown or disabled. */
  static async resolveInboundToken(token: string): Promise<{ organizationId: string } | null> {
    if (!token) return null;
    const [row] = await db
      .select({ organizationId: tenantIntegrationSettings.organizationId, enabled: tenantIntegrationSettings.inboundEmailEnabled })
      .from(tenantIntegrationSettings)
      .where(eq(tenantIntegrationSettings.inboundEmailToken, token))
      .limit(1);
    return row?.enabled === 1 ? { organizationId: row.organizationId } : null;
  }
}
