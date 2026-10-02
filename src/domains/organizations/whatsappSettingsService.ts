import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { tenantIntegrationSettings, organizations } from "@/db/schema";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";

// A tenant's own WhatsApp (Watxio) account. When enabled, sends use THEIR key (and X-Tenant-ID) and replies
// come back on THEIR inbound URL — so there is no cross-tenant guessing and no shared-number spend.
// Disabled = the platform number from env, exactly as before.

export interface WhatsAppView {
  enabled: boolean;
  hasApiKey: boolean;
  keyUnreadable: boolean; // stored but can't be decrypted (secret rotated) — re-enter it
  tenantId: string | null;
  inboundToken: string | null;
}

export interface WhatsAppCreds { apiKey: string; tenantId?: string }

const newToken = () => crypto.randomBytes(24).toString("base64url");

export class WhatsAppSettingsService {
  private static async row(organizationId: string) {
    const [r] = await db.select().from(tenantIntegrationSettings).where(eq(tenantIntegrationSettings.organizationId, organizationId)).limit(1);
    return r ?? null;
  }

  static async getView(organizationId: string): Promise<WhatsAppView> {
    const r = await this.row(organizationId);
    return {
      enabled: !!r?.whatsappEnabled,
      hasApiKey: !!r?.whatsappApiKeyEnc,
      keyUnreadable: !!r?.whatsappApiKeyEnc && !readSecret(r.whatsappApiKeyEnc),
      tenantId: r?.whatsappTenantId ?? null,
      inboundToken: r?.whatsappInboundToken ?? null,
    };
  }

  // Credentials to send with, or null = use the platform account.
  static async credsFor(organizationId: string): Promise<WhatsAppCreds | null> {
    const r = await this.row(organizationId);
    if (!r?.whatsappEnabled || !r.whatsappApiKeyEnc) return null;
    const apiKey = readSecret(r.whatsappApiKeyEnc);
    if (!apiKey) throw new Error("This workspace's WhatsApp key can't be read. Re-enter it in Settings → Integrations.");
    return { apiKey, ...(r.whatsappTenantId ? { tenantId: r.whatsappTenantId } : {}) };
  }

  static async orgForToken(token: string): Promise<string | null> {
    if (!token || token.length < 16) return null;
    const [r] = await db
      .select({ organizationId: tenantIntegrationSettings.organizationId })
      .from(tenantIntegrationSettings)
      .where(and(eq(tenantIntegrationSettings.whatsappInboundToken, token), eq(tenantIntegrationSettings.whatsappEnabled, 1)))
      .limit(1);
    return r?.organizationId ?? null;
  }

  // apiKey blank keeps the stored one (secrets are write-only in the UI). Connecting also switches the
  // workspace to Business-API mode — sends from the app only happen in that mode.
  static async save(organizationId: string, input: { apiKey?: string; tenantId?: string | null }): Promise<WhatsAppView> {
    const existing = await this.row(organizationId);
    const key = input.apiKey?.trim();
    if (!key && !existing?.whatsappApiKeyEnc) throw Object.assign(new Error("Enter your Watxio API key."), { code: "VALIDATION" });
    const set = {
      whatsappEnabled: 1,
      whatsappTenantId: input.tenantId?.trim() || null,
      ...(key ? { whatsappApiKeyEnc: encryptSecret(key) } : {}),
      whatsappInboundToken: existing?.whatsappInboundToken ?? newToken(),
      updatedAt: new Date(),
    };
    await db.insert(tenantIntegrationSettings).values({ organizationId, ...set }).onConflictDoUpdate({ target: tenantIntegrationSettings.organizationId, set });
    await db.update(organizations).set({ whatsappMode: "bsp" }).where(eq(organizations.id, organizationId));
    return this.getView(organizationId);
  }

  static async disconnect(organizationId: string): Promise<WhatsAppView> {
    await db.update(tenantIntegrationSettings)
      .set({ whatsappEnabled: 0, whatsappApiKeyEnc: null, whatsappTenantId: null, whatsappInboundToken: null, updatedAt: new Date() })
      .where(eq(tenantIntegrationSettings.organizationId, organizationId));
    return this.getView(organizationId);
  }

  static async rotateInboundToken(organizationId: string): Promise<WhatsAppView> {
    await db.update(tenantIntegrationSettings).set({ whatsappInboundToken: newToken(), updatedAt: new Date() }).where(eq(tenantIntegrationSettings.organizationId, organizationId));
    return this.getView(organizationId);
  }
}
