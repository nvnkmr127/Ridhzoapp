import { db } from "@/db";
import { activities, leads, whatsappMessages } from "@/db/schema";
import { eq, inArray, count } from "drizzle-orm";

export interface ChannelDistributionMetric {
  channel: string;
  count: number;
  percentage: number;
}

export interface ChannelAnalytics {
  totalTouchpoints: number;
  topChannel: string;
  distribution: ChannelDistributionMetric[];
}

export class ChannelAnalyticsService {
  /**
   * Analyzes communication channel utilization across WhatsApp, Phone Calls, Emails, and Notes.
   */
  static async getChannelMetrics(organizationId: string, knownLeadIds?: string[]): Promise<ChannelAnalytics> {
    let leadIds: string[];
    if (knownLeadIds !== undefined) {
      leadIds = knownLeadIds;
    } else {
      const orgLeads = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.organizationId, organizationId));
      leadIds = orgLeads.map((l) => l.id);
    }

    if (leadIds.length === 0) {
      return { totalTouchpoints: 0, topChannel: "None", distribution: [] };
    }

    // Fetch activity type counts
    const actRows = await db
      .select({
        type: activities.type,
        count: count(),
      })
      .from(activities)
      .where(inArray(activities.leadId, leadIds))
      .groupBy(activities.type);

    // Fetch whatsapp message count
    const waCountResult = await db
      .select({ count: count() })
      .from(whatsappMessages)
      .where(inArray(whatsappMessages.leadId, leadIds));

    const waCount = Number(waCountResult[0]?.count ?? 0);

    const countsMap: Record<string, number> = {
      whatsapp: waCount,
      call: 0,
      email: 0,
      note: 0,
      status_change: 0,
    };

    for (const r of actRows) {
      const typeKey = r.type || "note";
      countsMap[typeKey] = (countsMap[typeKey] ?? 0) + Number(r.count ?? 0);
    }

    const totalTouchpoints = Object.values(countsMap).reduce((a, b) => a + b, 0);

    if (totalTouchpoints === 0) {
      return { totalTouchpoints: 0, topChannel: "None", distribution: [] };
    }

    const distribution: ChannelDistributionMetric[] = Object.entries(countsMap)
      .map(([channel, cnt]) => ({
        channel,
        count: cnt,
        percentage: Math.round((cnt / totalTouchpoints) * 1000) / 10,
      }))
      .filter((d) => d.count > 0);

    distribution.sort((a, b) => b.count - a.count);

    const topChannel = distribution[0]?.channel || "whatsapp";

    return {
      totalTouchpoints,
      topChannel,
      distribution,
    };
  }
}
