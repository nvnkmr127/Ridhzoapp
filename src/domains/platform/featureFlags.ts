import { PlatformConfigService } from "./configService";

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  allowedOrgIds?: string[];
  plans?: ("free" | "pro" | "business")[];
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: "ai_assistant",
    name: "AI Copilot & Lead Recap",
    description: "LLM-driven smart WhatsApp drafting and lead recap generation.",
    enabled: true,
    plans: ["pro", "business"],
  },
  {
    key: "bsp_whatsapp",
    name: "WhatsApp Cloud BSP API",
    description: "Server-side high-throughput WhatsApp messaging via official Meta BSP.",
    enabled: true,
    plans: ["business"],
  },
  {
    key: "predictive_analytics",
    name: "Predictive Lead Scoring & LTV",
    description: "Machine learning conversion predictor and deal velocity forecasting.",
    enabled: true,
    plans: ["pro", "business"],
  },
  {
    key: "advanced_webhooks",
    name: "Universal Outbound Webhook DLQ",
    description: "Automatic retry engine and dead-letter queue inspection for endpoints.",
    enabled: true,
  },
];

export class FeatureFlagService {
  private static CONFIG_KEY = "feature_flags";

  static async list(): Promise<FeatureFlag[]> {
    const saved = await PlatformConfigService.get<FeatureFlag[]>(this.CONFIG_KEY, []);
    if (saved.length === 0) {
      await PlatformConfigService.set(this.CONFIG_KEY, DEFAULT_FLAGS);
      return DEFAULT_FLAGS;
    }
    return saved;
  }

  static async set(flag: FeatureFlag): Promise<FeatureFlag> {
    const flags = await this.list();
    const idx = flags.findIndex((f) => f.key === flag.key);
    if (idx >= 0) {
      flags[idx] = flag;
    } else {
      flags.push(flag);
    }
    await PlatformConfigService.set(this.CONFIG_KEY, flags);
    return flag;
  }

  static async toggle(key: string, enabled: boolean): Promise<FeatureFlag | null> {
    const flags = await this.list();
    const flag = flags.find((f) => f.key === key);
    if (!flag) return null;
    flag.enabled = enabled;
    await PlatformConfigService.set(this.CONFIG_KEY, flags);
    return flag;
  }

  static async isEnabled(key: string, organizationId?: string, plan?: string): Promise<boolean> {
    const flags = await this.list();
    const flag = flags.find((f) => f.key === key);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check specific tenant bypass list
    if (organizationId && flag.allowedOrgIds && flag.allowedOrgIds.includes(organizationId)) {
      return true;
    }

    // Check plan entitlement
    if (flag.plans && plan && !flag.plans.includes(plan as any)) {
      return false;
    }

    return true;
  }
}
