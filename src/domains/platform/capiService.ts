import crypto from "crypto";
import { PlatformConfigService } from "./configService";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";

export interface MetaCapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  enabled: boolean;
}

export interface CapiEventLog {
  id: string;
  eventName: string;
  orgId?: string;
  orgName?: string;
  email?: string;
  status: "success" | "failed" | "skipped";
  httpCode?: number;
  metaResponse?: any;
  timestamp: string;
}

let logSeq = 0;
const logId = () => `log_${Date.now()}_${logSeq++}`;

const CONFIG_KEY = "meta_capi_config";
const LOGS_KEY = "meta_capi_event_logs";
const DEFAULT_CONFIG: MetaCapiConfig = {
  pixelId: process.env.META_PIXEL_ID || "",
  accessToken: process.env.META_CAPI_ACCESS_TOKEN || "",
  testEventCode: process.env.META_TEST_EVENT_CODE || "",
  enabled: Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN),
};

function sha256(val: string): string {
  return crypto.createHash("sha256").update(val.trim().toLowerCase()).digest("hex");
}

export class MetaCapiService {
  static async getConfig(): Promise<MetaCapiConfig> {
    const saved = await PlatformConfigService.get<MetaCapiConfig>(CONFIG_KEY, DEFAULT_CONFIG);
    // The stored token is encrypted; older rows are still plaintext until their next save.
    return { ...DEFAULT_CONFIG, ...saved, accessToken: readSecret(saved.accessToken) ?? DEFAULT_CONFIG.accessToken };
  }

  // What the console may see: the access token is write-only (never sent to the browser), only
  // whether one is set. The page and the save action return this, not getConfig().
  static publicConfig(c: MetaCapiConfig): Omit<MetaCapiConfig, "accessToken"> & { accessToken: ""; hasAccessToken: boolean } {
    return { ...c, accessToken: "", hasAccessToken: !!c.accessToken };
  }

  static async saveConfig(input: Partial<MetaCapiConfig>): Promise<MetaCapiConfig> {
    const current = await this.getConfig();
    const updated: MetaCapiConfig = { ...current, ...input };
    await PlatformConfigService.set(CONFIG_KEY, { ...updated, accessToken: updated.accessToken ? encryptSecret(updated.accessToken) : "" });
    return updated;
  }

  static async listLogs(limit = 50): Promise<CapiEventLog[]> {
    const logs = await PlatformConfigService.get<CapiEventLog[]>(LOGS_KEY, []);
    return logs.slice(0, limit);
  }

  private static async appendLog(log: CapiEventLog): Promise<void> {
    try {
      await PlatformConfigService.update<CapiEventLog[]>(LOGS_KEY, [], (logs) => [log, ...logs].slice(0, 100));
    } catch {
      // Best-effort audit logging
    }
  }

  static async sendEvent(input: {
    eventName: "CompleteRegistration" | "Subscribe" | "Purchase" | "Lead" | "InitiateCheckout";
    email?: string;
    phone?: string;
    orgId?: string;
    orgName?: string;
    value?: number;
    currency?: string;
    fbp?: string;
    fbc?: string;
    ip?: string;
    userAgent?: string;
    eventSourceUrl?: string;
    /** Stable id so Meta can de-duplicate against a browser pixel event or a retry. */
    eventId?: string;
  }): Promise<{ ok: boolean; message: string; httpCode?: number; data?: any }> {
    const config = await this.getConfig();

    if (!config.enabled || !config.pixelId || !config.accessToken) {
      await this.appendLog({
        id: logId(),
        eventName: input.eventName,
        orgId: input.orgId,
        orgName: input.orgName,
        email: input.email ? input.email.slice(0, 3) + "***" : undefined,
        status: "skipped",
        metaResponse: "CAPI disabled or credentials missing",
        timestamp: new Date().toISOString(),
      });
      return { ok: false, message: "CAPI is not enabled or credentials not configured." };
    }

    const userData: Record<string, any> = {};
    if (input.email) userData.em = [sha256(input.email)];
    if (input.phone) userData.ph = [sha256(input.phone)];
    if (input.ip) userData.client_ip_address = input.ip;
    if (input.userAgent) userData.client_user_agent = input.userAgent;
    if (input.fbp) userData.fbp = input.fbp;
    if (input.fbc) userData.fbc = input.fbc;

    // Meta rejects events with no way to match a person; don't burn a request (and a failure log) on them.
    if (Object.keys(userData).length === 0) {
      await this.appendLog({
        id: logId(),
        eventName: input.eventName,
        orgId: input.orgId,
        orgName: input.orgName,
        status: "skipped",
        metaResponse: "No identifiers (email, phone, fbp, fbc) to match on",
        timestamp: new Date().toISOString(),
      });
      return { ok: false, message: "No identifiers to match this event on, so it was not sent." };
    }

    const payload: any = {
      event_id: input.eventId ?? (input.orgId ? `${input.eventName}_${input.orgId}` : undefined),
      event_name: input.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: input.eventSourceUrl || "https://ridhzo.com/signup",
      action_source: "website",
      user_data: userData,
    };

    if (input.value !== undefined) {
      payload.custom_data = {
        value: input.value,
        currency: input.currency || "INR",
        content_name: input.eventName,
      };
    }

    const body: any = {
      data: [payload],
      access_token: config.accessToken, // in the body, not the URL, so it never lands in request logs
    };

    if (config.testEventCode) {
      body.test_event_code = config.testEventCode;
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${config.pixelId}/events`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      const isSuccess = res.ok && !data.error;

      await this.appendLog({
        id: logId(),
        eventName: input.eventName,
        orgId: input.orgId,
        orgName: input.orgName,
        email: input.email ? input.email.slice(0, 3) + "***" : undefined,
        status: isSuccess ? "success" : "failed",
        httpCode: res.status,
        metaResponse: data,
        timestamp: new Date().toISOString(),
      });

      return {
        ok: isSuccess,
        message: isSuccess ? "Event sent to Meta Conversions API" : data.error?.message || "CAPI error",
        httpCode: res.status,
        data,
      };
    } catch (err: any) {
      await this.appendLog({
        id: logId(),
        eventName: input.eventName,
        orgId: input.orgId,
        orgName: input.orgName,
        email: input.email ? input.email.slice(0, 3) + "***" : undefined,
        status: "failed",
        metaResponse: err.message,
        timestamp: new Date().toISOString(),
      });
      return { ok: false, message: err.message || "Failed to reach Meta Graph API" };
    }
  }
}
