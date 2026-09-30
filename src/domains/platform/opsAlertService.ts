import { PlatformConfigService } from "./configService";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";

export interface OpsWebhookConfig {
  url: string;
  enabled: boolean;
  notifyOnSladeadline: boolean;
  notifyOnDlq: boolean;
  notifyOnPlanChange: boolean;
  notifyOnGdpr: boolean;
  notifyOnTickets?: boolean; // new tickets + tenant replies (undefined = on)
  // Zoho Cliq OAuth (Self Client) — only for Cliq API URLs without a ?zapikey=. Secrets stay encrypted.
  cliqClientId?: string;
  cliqClientSecretEnc?: string;
  cliqRefreshTokenEnc?: string;
  updatedAt?: string;
}

// What the browser gets: never the secrets, only whether they're set.
export interface AlertLogEntry { at: string; event: string; title: string; ok: boolean; error?: string }
export type OpsWebhookView = Omit<OpsWebhookConfig, "cliqClientSecretEnc" | "cliqRefreshTokenEnc"> & { hasCliqOAuth: boolean; recentAlerts: AlertLogEntry[] };

// Sample messages for the console's per-event test button.
export const SAMPLE_ALERTS: Record<string, { label: string; title: string; body: string }> = {
  "support.new": { label: "New support ticket", title: "New technical ticket (medium)", body: "*Acme Corp* — Sample: WhatsApp messages not sending" },
  "support.reply": { label: "Tenant reply", title: "Tenant replied on a ticket", body: "*Acme Corp* — Sample: WhatsApp messages not sending\nStill failing after the token refresh." },
  "sla.support_ticket": { label: "Ticket SLA breach", title: "Support SLA missed (high)", body: "*Acme Corp* — Sample: WhatsApp messages not sending\nOpen 7h past its response deadline." },
  "dlq.spike": { label: "Failed deliveries", title: "Failed-delivery spike", body: "Sample: 12 webhook deliveries failed in the last hour." },
  "plan.change": { label: "Plan change", title: "Plan changed", body: "*Acme Corp* moved from starter to pro (sample)." },
  "compliance.request": { label: "Data request", title: "GDPR data request", body: "Sample: erasure request received for *Acme Corp*." },
};
const LOG_KEY = "ops_alert_log";
const LOG_MAX = 10;

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

async function zohoToken(accountsHost: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://${accountsHost}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(6000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (json.error || !res.ok) {
    const hint = json.error === "invalid_code" ? " — the code or token is wrong, expired or already used; generate a new grant code and use Connect with code" : "";
    throw new Error(`Zoho token request failed: ${json.error ?? res.status}${hint}`);
  }
  return json;
}

async function cliqAccessToken(cfg: OpsWebhookConfig, accountsHost: string): Promise<string> {
  const secret = readSecret(cfg.cliqClientSecretEnc);
  const refresh = readSecret(cfg.cliqRefreshTokenEnc);
  if (!cfg.cliqClientId || !secret || !refresh) throw new Error("Zoho Cliq OAuth credentials are incomplete.");
  const key = `${accountsHost}:${cfg.cliqClientId}:${refresh}`;
  if (tokenCache && tokenCache.key === key && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;

  const json = await zohoToken(accountsHost, { grant_type: "refresh_token", client_id: cfg.cliqClientId, client_secret: secret, refresh_token: refresh });
  if (!json.access_token) throw new Error("Zoho returned no access token.");
  tokenCache = { key, token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return json.access_token;
}

export class OpsAlertService {
  private static CONFIG_KEY = "ops_webhook_config";

  static async getConfig(): Promise<OpsWebhookConfig> {
    return PlatformConfigService.get<OpsWebhookConfig>(this.CONFIG_KEY, DEFAULT_CONFIG);
  }

  static getLog(): Promise<AlertLogEntry[]> {
    return PlatformConfigService.get<AlertLogEntry[]>(LOG_KEY, []);
  }

  // Newest first, last LOG_MAX. Best-effort: never let logging break (or mask) an alert.
  // ponytail: read-modify-write, so two simultaneous alerts can drop one log line.
  private static async log(entry: Omit<AlertLogEntry, "at">): Promise<void> {
    try {
      const prev = await this.getLog();
      await PlatformConfigService.set(LOG_KEY, [{ at: new Date().toISOString(), ...entry }, ...prev].slice(0, LOG_MAX));
    } catch {
      // ignore
    }
  }

  static async getView(): Promise<OpsWebhookView> {
    const { cliqClientSecretEnc, cliqRefreshTokenEnc, ...rest } = await this.getConfig();
    return { ...rest, hasCliqOAuth: !!(rest.cliqClientId && cliqClientSecretEnc && cliqRefreshTokenEnc), recentAlerts: await this.getLog() };
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

  // One-time: trade a Self Client grant code for a refresh token and store it (encrypted) with the
  // client credentials. clientSecret blank → keep the stored one.
  static async connectCliq(input: { url: string; clientId: string; clientSecret?: string; grantCode: string }): Promise<void> {
    const accountsHost = cliqAccountsHost(input.url);
    if (!accountsHost) throw new Error("Enter your Zoho Cliq API URL first (https://cliq.zoho.<region>/…).");
    const prev = await this.getConfig();
    const clientSecret = input.clientSecret || readSecret(prev.cliqClientSecretEnc);
    if (!input.clientId || !clientSecret) throw new Error("Enter the Zoho Client ID and Client Secret.");
    const json = await zohoToken(accountsHost, {
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: clientSecret,
      code: input.grantCode,
    });
    if (!json.refresh_token) throw new Error("Zoho returned no refresh token — generate a fresh grant code and try again.");
    const { cliqClientSecretEnc: _s, cliqRefreshTokenEnc: _r, updatedAt: _u, ...rest } = prev;
    await this.saveConfig({ ...rest, url: input.url, cliqClientId: input.clientId, cliqClientSecret: clientSecret, cliqRefreshToken: json.refresh_token });
    tokenCache = null;
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
    if (event.startsWith("support") && config.notifyOnTickets === false) return false;

    try {
      const res = await this.post(
        config,
        `🚨 *[Ridhzo Ops Alert]*: *${title}*\n${markdownMessage}\n_Timestamp: ${new Date().toISOString()}_`,
        6000,
      );
      await this.log({ event, title, ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
      return res.ok;
    } catch (e) {
      await this.log({ event, title, ok: false, error: e instanceof Error ? e.message : "failed" });
      return false;
    }
  }

  // Sends a sample for `event` (or a plain connection ping) regardless of the per-event toggles.
  static async sendTestPing(event?: string): Promise<{ ok: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config.url) {
      return { ok: false, message: "No webhook URL configured." };
    }
    const sample = event ? SAMPLE_ALERTS[event] : undefined;
    const text = sample
      ? `🧪 *[Ridhzo Ops Alert — sample]*: *${sample.title}*\n${sample.body}\n_Timestamp: ${new Date().toISOString()}_`
      : `✅ *[Ridhzo Ops]* Connection Verified!\nSuperAdmin test notification sent from platform console.\n_Time: ${new Date().toISOString()}_`;
    const name = event ?? "test";
    const title = sample?.title ?? "Connection test";
    try {
      const res = await this.post(config, text, 8000);
      await this.log({ event: name, title, ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
      if (res.ok) return { ok: true, message: "Test alert delivered successfully." };
      return { ok: false, message: `Webhook responded with status HTTP ${res.status}.` };
    } catch (e: any) {
      await this.log({ event: name, title, ok: false, error: e.message });
      return { ok: false, message: `Failed to deliver webhook: ${e.message || "Network timeout"}` };
    }
  }
}
