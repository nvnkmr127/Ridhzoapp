import crypto from "crypto";
import { db } from "@/db";
import { tenantIntegrationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";

// Per-tenant config for lead enrichment + inbound email, configured from the frontend. Mirrors
// EmailSettingsService: encrypted secret at rest, a masked view for the UI, and a resolved config
// for the backend. Replaces the platform env vars ENRICHMENT_API_* and EMAIL_INBOUND_SECRET.

export interface TenantIntegrationsView {
  enrichmentEnabled: boolean;
  enrichmentApiUrl: string | null;
  enrichmentAuthHeader: string | null;
  hasEnrichmentAuthValue: boolean;
  enrichmentTimeoutMs: number | null;
  inboundEmailEnabled: boolean;
  inboundEmailToken: string | null;
  capiEnabled: boolean;
  capiPixelId: string | null;
  hasCapiAccessToken: boolean;
  capiTestEventCode: string | null;
  capiLeadStageMap: Record<string, string>; // resolved (tenant override or default)
}

// Default Conversion Leads mapping: CRM status → Meta lead-stage event name. Tenants can override.
export const DEFAULT_CAPI_STAGE_MAP: Record<string, string> = {
  contacted: "contacted",
  qualified: "qualified",
  won: "converted",
};

export interface CapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
}

export interface CapiInputUpsert {
  enabled?: boolean;
  pixelId?: string | null;
  accessToken?: string; // blank/undefined = keep existing
  testEventCode?: string | null;
}

export interface EnrichmentConfig {
  url: string;
  authHeader: string;
  authValue: string;
  timeoutMs: number;
}

export interface EnrichmentInputUpsert {
  enabled?: boolean;
  apiUrl?: string | null;
  authHeader?: string | null;
  authValue?: string; // blank/undefined = keep existing
  timeoutMs?: number | null;
}

// Sensible fallbacks used only when a tenant leaves a field blank — not baked-in behaviour.
const DEFAULT_AUTH_HEADER = "Authorization";
const DEFAULT_TIMEOUT_MS = 10_000;

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url"); // 32 url-safe chars
}

export class TenantIntegrationsService {
  static async getRaw(organizationId: string) {
    try {
      const [row] = await db
        .select()
        .from(tenantIntegrationSettings)
        .where(eq(tenantIntegrationSettings.organizationId, organizationId))
        .limit(1);
      return row ?? null;
    } catch (e) {
      // Tolerate the capi_lead_stage_map column not existing yet (a deploy that ran before the
      // migration). Re-select the stable columns so the whole settings page + CAPI don't 500; the
      // new column defaults to null until the ALTER is applied. Self-heals once the column exists.
      if (!(e instanceof Error) || !/capi_lead_stage_map/.test(e.message)) throw e;
      const t = tenantIntegrationSettings;
      const [row] = await db
        .select({
          id: t.id,
          organizationId: t.organizationId,
          enrichmentEnabled: t.enrichmentEnabled,
          enrichmentApiUrl: t.enrichmentApiUrl,
          enrichmentAuthHeader: t.enrichmentAuthHeader,
          enrichmentAuthValueEnc: t.enrichmentAuthValueEnc,
          enrichmentTimeoutMs: t.enrichmentTimeoutMs,
          inboundEmailEnabled: t.inboundEmailEnabled,
          inboundEmailToken: t.inboundEmailToken,
          capiEnabled: t.capiEnabled,
          capiPixelId: t.capiPixelId,
          capiAccessTokenEnc: t.capiAccessTokenEnc,
          capiTestEventCode: t.capiTestEventCode,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })
        .from(t)
        .where(eq(t.organizationId, organizationId))
        .limit(1);
      return row ? { ...row, capiLeadStageMap: null } : null;
    }
  }

  static async getView(organizationId: string): Promise<TenantIntegrationsView> {
    const row = await this.getRaw(organizationId);
    return {
      enrichmentEnabled: row?.enrichmentEnabled === 1,
      enrichmentApiUrl: row?.enrichmentApiUrl ?? null,
      enrichmentAuthHeader: row?.enrichmentAuthHeader ?? null,
      hasEnrichmentAuthValue: !!row?.enrichmentAuthValueEnc,
      enrichmentTimeoutMs: row?.enrichmentTimeoutMs ?? null,
      inboundEmailEnabled: row?.inboundEmailEnabled === 1,
      inboundEmailToken: row?.inboundEmailToken ?? null,
      capiEnabled: row?.capiEnabled === 1,
      capiPixelId: row?.capiPixelId ?? null,
      hasCapiAccessToken: !!row?.capiAccessTokenEnc,
      capiTestEventCode: row?.capiTestEventCode ?? null,
      capiLeadStageMap: row?.capiLeadStageMap ?? DEFAULT_CAPI_STAGE_MAP,
    };
  }

  /** Resolved Conversion Leads stage map for the backend: tenant override, else the default. */
  static async getCapiStageMap(organizationId: string): Promise<Record<string, string>> {
    const row = await this.getRaw(organizationId);
    return row?.capiLeadStageMap ?? DEFAULT_CAPI_STAGE_MAP;
  }

  /** Save a tenant's Conversion Leads stage map. An empty map clears back to the default on read. */
  static async upsertCapiStageMap(organizationId: string, map: Record<string, string>): Promise<TenantIntegrationsView> {
    const clean = Object.fromEntries(
      Object.entries(map)
        .map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
        .filter(([k, v]) => k && v),
    );
    await db
      .insert(tenantIntegrationSettings)
      .values({ organizationId, capiLeadStageMap: clean, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: tenantIntegrationSettings.organizationId,
        set: { capiLeadStageMap: clean, updatedAt: new Date() },
      });
    return this.getView(organizationId);
  }

  /** Upsert enrichment config. Keeps the stored auth value when the form leaves it blank. */
  static async upsertEnrichment(organizationId: string, input: EnrichmentInputUpsert): Promise<TenantIntegrationsView> {
    const existing = await this.getRaw(organizationId);
    const authValueEnc =
      input.authValue && input.authValue.length > 0
        ? encryptSecret(input.authValue)
        : existing?.enrichmentAuthValueEnc ?? null;

    const values = {
      organizationId,
      enrichmentEnabled: (input.enabled ?? existing?.enrichmentEnabled === 1) ? 1 : 0,
      enrichmentApiUrl: input.apiUrl ?? existing?.enrichmentApiUrl ?? null,
      enrichmentAuthHeader: input.authHeader ?? existing?.enrichmentAuthHeader ?? null,
      enrichmentAuthValueEnc: authValueEnc,
      enrichmentTimeoutMs: input.timeoutMs ?? existing?.enrichmentTimeoutMs ?? null,
      // Carry inbound-email fields through unchanged.
      inboundEmailEnabled: existing?.inboundEmailEnabled ?? 0,
      inboundEmailToken: existing?.inboundEmailToken ?? null,
      updatedAt: new Date(),
    };

    await db
      .insert(tenantIntegrationSettings)
      .values(values)
      .onConflictDoUpdate({
        target: tenantIntegrationSettings.organizationId,
        set: {
          enrichmentEnabled: values.enrichmentEnabled,
          enrichmentApiUrl: values.enrichmentApiUrl,
          enrichmentAuthHeader: values.enrichmentAuthHeader,
          enrichmentAuthValueEnc: values.enrichmentAuthValueEnc,
          enrichmentTimeoutMs: values.enrichmentTimeoutMs,
          updatedAt: values.updatedAt,
        },
      });
    return this.getView(organizationId);
  }

  /** Enable/disable inbound email, minting a token on first enable. */
  static async setInboundEmail(organizationId: string, enabled: boolean): Promise<TenantIntegrationsView> {
    const existing = await this.getRaw(organizationId);
    const token = existing?.inboundEmailToken ?? (enabled ? newToken() : null);

    const values = {
      organizationId,
      enrichmentEnabled: existing?.enrichmentEnabled ?? 0,
      enrichmentApiUrl: existing?.enrichmentApiUrl ?? null,
      enrichmentAuthHeader: existing?.enrichmentAuthHeader ?? null,
      enrichmentAuthValueEnc: existing?.enrichmentAuthValueEnc ?? null,
      enrichmentTimeoutMs: existing?.enrichmentTimeoutMs ?? null,
      inboundEmailEnabled: enabled ? 1 : 0,
      inboundEmailToken: token,
      updatedAt: new Date(),
    };

    await db
      .insert(tenantIntegrationSettings)
      .values(values)
      .onConflictDoUpdate({
        target: tenantIntegrationSettings.organizationId,
        set: { inboundEmailEnabled: values.inboundEmailEnabled, inboundEmailToken: token, updatedAt: values.updatedAt },
      });
    return this.getView(organizationId);
  }

  /** Upsert Meta CAPI config. Keeps the stored access token when the form leaves it blank. */
  static async upsertCapi(organizationId: string, input: CapiInputUpsert): Promise<TenantIntegrationsView> {
    const existing = await this.getRaw(organizationId);
    const tokenEnc =
      input.accessToken && input.accessToken.length > 0
        ? encryptSecret(input.accessToken)
        : existing?.capiAccessTokenEnc ?? null;

    const values = {
      organizationId,
      enrichmentEnabled: existing?.enrichmentEnabled ?? 0,
      enrichmentApiUrl: existing?.enrichmentApiUrl ?? null,
      enrichmentAuthHeader: existing?.enrichmentAuthHeader ?? null,
      enrichmentAuthValueEnc: existing?.enrichmentAuthValueEnc ?? null,
      enrichmentTimeoutMs: existing?.enrichmentTimeoutMs ?? null,
      inboundEmailEnabled: existing?.inboundEmailEnabled ?? 0,
      inboundEmailToken: existing?.inboundEmailToken ?? null,
      capiEnabled: (input.enabled ?? existing?.capiEnabled === 1) ? 1 : 0,
      capiPixelId: input.pixelId ?? existing?.capiPixelId ?? null,
      capiAccessTokenEnc: tokenEnc,
      capiTestEventCode: input.testEventCode ?? existing?.capiTestEventCode ?? null,
      updatedAt: new Date(),
    };

    await db
      .insert(tenantIntegrationSettings)
      .values(values)
      .onConflictDoUpdate({
        target: tenantIntegrationSettings.organizationId,
        set: {
          capiEnabled: values.capiEnabled,
          capiPixelId: values.capiPixelId,
          capiAccessTokenEnc: values.capiAccessTokenEnc,
          capiTestEventCode: values.capiTestEventCode,
          updatedAt: values.updatedAt,
        },
      });
    return this.getView(organizationId);
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

  /** Rotate the inbound token (invalidates the old webhook URL). */
  static async rotateInboundToken(organizationId: string): Promise<TenantIntegrationsView> {
    await db
      .update(tenantIntegrationSettings)
      .set({ inboundEmailToken: newToken(), updatedAt: new Date() })
      .where(eq(tenantIntegrationSettings.organizationId, organizationId));
    return this.getView(organizationId);
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
      .select({ organizationId: tenantIntegrationSettings.organizationId })
      .from(tenantIntegrationSettings)
      .where(eq(tenantIntegrationSettings.inboundEmailToken, token))
      .limit(1);
    // getRaw would re-query; check enabled inline instead.
    if (!row) return null;
    const full = await this.getRaw(row.organizationId);
    return full?.inboundEmailEnabled === 1 ? { organizationId: row.organizationId } : null;
  }
}
