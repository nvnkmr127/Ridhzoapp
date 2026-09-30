import { PlatformConfigService } from "./configService";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";

export interface OpsWebhookConfig {
  url: string;
  enabled: boolean;
  notifyOnSladeadline: boolean;
  notifyOnDlq: boolean;
  notifyOnPlanChange: boolean;
  notifyOnGdpr: boolean;
  // Zoho Cliq OAuth (Self Client) — only for Cliq API URLs without a ?zapikey=. Secrets stay encrypted.
  cliqClientId?: string;
  cliqClientSecretEnc?: string;
  cliqRefreshTokenEnc?: string;
  updatedAt?: string;
}

// What the browser gets: never the secrets, only whether they're set.
export type OpsWebhookView = Omit<OpsWebhookConfig, "cliqClientSecretEnc" | "cliqRefreshTokenEnc"> & { hasCliqOAuth: boolean };

export interface OpsWebhookInput extends Omit<OpsWebhookConfig, "cliqClientSecretEnc" | "cliqRefreshTokenEnc" | "updatedAt"> {
  cliqClientSecret?: string; // blank keeps the stored value
  cliqRefreshToken?: string;
}

const DEFAULT_CONFIG: OpsWebhookConfig = {
  url: "",
  enabled: false,
  notifyOnSladeadline: true,
  notifyOnDlq: true,
  notifyOnPlanChange: true,
  notifyOnGdpr: true,
};

// cliq.zoho.in → accounts.zoho.in (each Zoho data center has its own accounts host). Null for any
// other host, so OAuth secrets are never sent anywhere but Zoho.
export function cliqAccountsHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return /^cliq\.zoho\.(com|in|eu|com\.au|jp|com\.cn|sa|ca)$/.test(host) ? host.replace(/^cliq\./, "accounts.") : null;
  } catch {
    return null;
  }
}

let tokenCache: { key: string; token: string; exp: number } | null = null;

async function cliqAccessToken(cfg: OpsWebhookConfig, accountsHost: string): Promise<string> {
  const secret = readSecret(cfg.cliqClientSecretEnc);
  const refresh = readSecret(cfg.cliqRefreshTokenEnc);
  if (!cfg.cliqClientId || !secret || !refresh) throw new Error("Zoho Cliq OAuth credentials are incomplete.");
  const key = `${accountsHost}:${cfg.cliqClientId}:${refresh}`;
  if (tokenCache && tokenCache.key === key && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;

  const res = await fetch(`https://${accountsHost}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: cfg.cliqClientId, client_secret: secret, refresh_token: refresh }),
    signal: AbortSignal.timeout(4000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json.access_token) throw new Error(`Zoho token refresh failed: ${json.error ?? res.status}`);
  tokenCache = { key, token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return json.access_token;
}

export class OpsAlertService {
  private static CONFIG_KEY = "ops_webhook_config";

  static async getConfig(): Promise<OpsWebhookConfig> {
    return PlatformConfigService.get<OpsWebhookConfig>(this.CONFIG_KEY, DEFAULT_CONFIG);
  }

  static async getView(): Promise<OpsWebhookView> {
    const { cliqClientSecretEnc, cliqRefreshTokenEnc, ...rest } = await this.getConfig();
    return { ...rest, hasCliqOAuth: !!(rest.cliqClientId && cliqClientSecretEnc && cliqRefreshTokenEnc) };
  }

  static async saveConfig(input: OpsWebhookInput): Promise<void> {
    const prev = await this.getConfig();
    const { cliqClientSecret, cliqRefreshToken, ...rest } = input;
    await PlatformConfigService.set(this.CONFIG_KEY, {
      ...rest,
      cliqClientSecretEnc: cliqClientSecret ? encryptSecret(cliqClientSecret) : prev.cliqClientSecretEnc,
      cliqRefreshTokenEnc: cliqRefreshToken ? encryptSecret(cliqRefreshToken) : prev.cliqRefreshTokenEnc,
      updatedAt: new Date().toISOString(),
    });
  }

  // POST {text} to the configured URL. Cliq API URLs (no zapikey) get an OAuth bearer; anything else
  // (Slack/Discord/zapikey webhooks) is a plain POST. Returns the HTTP response.
  private static async post(config: OpsWebhookConfig, text: string, timeoutMs: number): Promise<Response> {
    // The URL is admin-set, but still never let it reach internal addresses (same guard as webhooks).
    const { assertPublicHttpUrl } = await import("@/lib/webhooks/ssrf");
    await assertPublicHttpUrl(config.url);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const accountsHost = cliqAccountsHost(config.url);
    if (accountsHost && !config.url.includes("zapikey=") && config.cliqClientId) {
      headers.Authorization = `Zoho-oauthtoken ${await cliqAccessToken(config, accountsHost)}`;
    }
    return fetch(config.url, {
      redirect: "manual",
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  static async dispatchAlert(event: string, title: string, markdownMessage: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config.enabled || !config.url) return false;

    // Filter event preferences
    if (event.startsWith("sla") && !config.notifyOnSladeadline) return false;
    if (event.startsWith("dlq") && !config.notifyOnDlq) return false;
    if (event.startsWith("plan") && !config.notifyOnPlanChange) return false;
    if (event.startsWith("compliance") && !config.notifyOnGdpr) return false;

    try {
      const res = await this.post(
        config,
        `🚨 *[Ridhzo Ops Alert]*: *${title}*\n${markdownMessage}\n_Timestamp: ${new Date().toISOString()}_`,
        6000,
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  static async sendTestPing(): Promise<{ ok: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config.url) {
      return { ok: false, message: "No webhook URL configured." };
    }

    try {
      const res = await this.post(
        config,
        `✅ *[Ridhzo Ops]* Connection Verified!\nSuperAdmin test notification sent from platform console.\n_Time: ${new Date().toISOString()}_`,
        8000,
      );
      if (res.ok) {
        return { ok: true, message: "Test alert delivered successfully (HTTP 200)." };
      }
      return { ok: false, message: `Webhook responded with status HTTP ${res.status}.` };
    } catch (e: any) {
      return { ok: false, message: `Failed to deliver webhook: ${e.message || "Network timeout"}` };
    }
  }
}
