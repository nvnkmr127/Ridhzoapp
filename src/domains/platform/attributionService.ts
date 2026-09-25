import { canonicalPlan, isPaidPlan, PLAN_MONTHLY_PRICE } from "@/domains/billing/planNames";
import { PlatformConfigService } from "./configService";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { StoredAttribution } from "@/lib/tracking/utm";

export interface TenantAttribution extends StoredAttribution {
  organizationId: string;
  createdAt: string;
}

export interface CampaignAnalytics {
  campaign: string;
  source: string;
  medium: string;
  signups: number;
  paidTenants: number;
  conversionRate: number;
  mrr: number;
}

const ATTRIBUTION_CONFIG_KEY = "tenant_attributions";

const PLAN_MRR = PLAN_MONTHLY_PRICE;

export class PlatformAttributionService {
  static async recordAttribution(
    organizationId: string,
    attribution: StoredAttribution
  ): Promise<TenantAttribution> {
    const all = await PlatformConfigService.get<Record<string, TenantAttribution>>(
      ATTRIBUTION_CONFIG_KEY,
      {}
    );

    const record: TenantAttribution = {
      ...attribution,
      organizationId,
      createdAt: new Date().toISOString(),
    };

    all[organizationId] = record;
    await PlatformConfigService.set(ATTRIBUTION_CONFIG_KEY, all);
    return record;
  }

  static async getAttribution(organizationId: string): Promise<TenantAttribution | null> {
    const all = await PlatformConfigService.get<Record<string, TenantAttribution>>(
      ATTRIBUTION_CONFIG_KEY,
      {}
    );
    return all[organizationId] ?? null;
  }

  static async listAllAttributions(): Promise<Record<string, TenantAttribution>> {
    return PlatformConfigService.get<Record<string, TenantAttribution>>(ATTRIBUTION_CONFIG_KEY, {});
  }

  static async getCampaignAnalytics(): Promise<{
    campaigns: CampaignAnalytics[];
    totalSignups: number;
    attributedSignups: number;
    directSignups: number;
    attributedMrr: number;
  }> {
    const [orgList, attributions] = await Promise.all([
      db.select({ id: organizations.id, plan: organizations.plan, createdAt: organizations.createdAt }).from(organizations),
      this.listAllAttributions(),
    ]);

    const campaignMap = new Map<
      string,
      { campaign: string; source: string; medium: string; signups: number; paidTenants: number; mrr: number }
    >();

    const totalSignups = orgList.length;
    let attributedSignups = 0;
    let attributedMrr = 0;

    for (const org of orgList) {
      const attr = attributions[org.id];
      const plan = canonicalPlan(org.plan);
      const isPaid = isPaidPlan(plan);
      const planPrice = PLAN_MRR[plan] ?? 0;

      const campaignName = attr?.utmCampaign || (attr?.utmSource ? `${attr.utmSource}_direct` : "Direct / Organic");
      const source = attr?.utmSource || "Direct";
      const medium = attr?.utmMedium || (attr?.fbclid ? "cpc_meta" : attr?.gclid ? "cpc_google" : "none");

      if (attr && (attr.utmCampaign || attr.utmSource || attr.fbclid || attr.gclid)) {
        attributedSignups++;
        attributedMrr += planPrice;
      }

      const key = `${campaignName}:::${source}:::${medium}`;
      const current = campaignMap.get(key) ?? {
        campaign: campaignName,
        source,
        medium,
        signups: 0,
        paidTenants: 0,
        mrr: 0,
      };

      current.signups += 1;
      if (isPaid) {
        current.paidTenants += 1;
        current.mrr += planPrice;
      }
      campaignMap.set(key, current);
    }

    const campaigns: CampaignAnalytics[] = Array.from(campaignMap.values())
      .map((c) => ({
        ...c,
        conversionRate: c.signups > 0 ? Math.round((c.paidTenants / c.signups) * 100) : 0,
      }))
      .sort((a, b) => b.signups - a.signups);

    return {
      campaigns,
      totalSignups,
      attributedSignups,
      directSignups: totalSignups - attributedSignups,
      attributedMrr,
    };
  }
}
