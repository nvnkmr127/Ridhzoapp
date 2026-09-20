import { PlatformConfigService } from "./configService";

export interface OpsWebhookConfig {
  url: string;
  enabled: boolean;
  notifyOnSladeadline: boolean;
  notifyOnDlq: boolean;
  notifyOnPlanChange: boolean;
  notifyOnGdpr: boolean;
  updatedAt?: string;
}

const DEFAULT_CONFIG: OpsWebhookConfig = {
  url: "",
  enabled: false,
  notifyOnSladeadline: true,
  notifyOnDlq: true,
  notifyOnPlanChange: true,
  notifyOnGdpr: true,
};

export class OpsAlertService {
  private static CONFIG_KEY = "ops_webhook_config";

  static async getConfig(): Promise<OpsWebhookConfig> {
    return PlatformConfigService.get<OpsWebhookConfig>(this.CONFIG_KEY, DEFAULT_CONFIG);
  }

  static async saveConfig(config: OpsWebhookConfig): Promise<void> {
    await PlatformConfigService.set(this.CONFIG_KEY, {
      ...config,
      updatedAt: new Date().toISOString(),
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
      const payload = {
        text: `🚨 *[Ridhzo Ops Alert]*: *${title}*\n${markdownMessage}\n_Timestamp: ${new Date().toISOString()}_`,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

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
      const payload = {
        text: `✅ *[Ridhzo Ops]* Connection Verified!\nSuperAdmin test notification sent from platform console.\n_Time: ${new Date().toISOString()}_`,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return { ok: true, message: "Test alert delivered successfully (HTTP 200)." };
      }
      return { ok: false, message: `Webhook responded with status HTTP ${res.status}.` };
    } catch (e: any) {
      return { ok: false, message: `Failed to deliver webhook: ${e.message || "Network timeout"}` };
    }
  }
}
