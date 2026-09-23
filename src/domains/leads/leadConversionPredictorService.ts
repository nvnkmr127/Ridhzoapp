import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

export type ConversionLikelihoodTier = "very_high" | "high" | "moderate" | "low";

export interface HighProbabilityLeadSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  score: number;
  expectedValue: number;
  conversionProbability: number;
  likelihoodTier: ConversionLikelihoodTier;
  ownerId: string | null;
}

export interface LeadConversionPredictionReport {
  totalActiveLeads: number;
  averageConversionProbability: number;
  totalHighProbabilityValue: number;
  highProbabilityLeadsCount: number;
  leads: HighProbabilityLeadSummary[];
}

export class LeadConversionPredictorService {
  /**
   * Predicts lead conversion win probabilities and computes high-probability deal pipeline metrics for active leads.
   */
  static async getConversionPredictions(
    organizationId: string,
    enforceOwnerId?: string
  ): Promise<LeadConversionPredictionReport> {
    const activeLeads = await db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        company: leads.company,
        status: leads.status,
        priority: leads.priority,
        score: leads.score,
        expectedValue: leads.expectedValue,
        nextFollowUpAt: leads.nextFollowUpAt,
        lastContactedAt: leads.lastContactedAt,
        createdAt: leads.createdAt,
        ownerId: leads.ownerId,
      })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, organizationId),
          isNull(leads.deletedAt),
          inArray(leads.status, ["new", "active"]),
          ...(enforceOwnerId ? [eq(leads.ownerId, enforceOwnerId)] : [])
        )
      );

    if (activeLeads.length === 0) {
      return {
        totalActiveLeads: 0,
        averageConversionProbability: 0,
        totalHighProbabilityValue: 0,
        highProbabilityLeadsCount: 0,
        leads: [],
      };
    }

    const now = Date.now();
    let probabilitySum = 0;
    let totalHighProbabilityValue = 0;
    let highProbabilityLeadsCount = 0;
    const summaries: HighProbabilityLeadSummary[] = [];

    for (const lead of activeLeads) {
      // 1. Score Weight (0 to 30 pts)
      const leadScore = lead.score ?? 0;
      const scorePoints = Math.min(30, Math.max(0, Math.floor(leadScore * 0.3)));

      // 2. Contact Recency Weight (0 to 25 pts)
      const refTime = lead.lastContactedAt
        ? new Date(lead.lastContactedAt).getTime()
        : new Date(lead.createdAt).getTime();
      const daysSinceContact = Math.floor((now - refTime) / (1000 * 60 * 60 * 24));
      let recencyPoints = 0;
      if (daysSinceContact <= 1) recencyPoints = 25;
      else if (daysSinceContact <= 3) recencyPoints = 20;
      else if (daysSinceContact <= 7) recencyPoints = 14;
      else if (daysSinceContact <= 14) recencyPoints = 7;
      else recencyPoints = 0;

      // 3. Profile Completeness (0 to 20 pts)
      let completenessPoints = 0;
      if (lead.name) completenessPoints += 4;
      if (lead.phone) completenessPoints += 4;
      if (lead.email) completenessPoints += 4;
      if (lead.company) completenessPoints += 4;
      if (lead.expectedValue && parseFloat(String(lead.expectedValue)) > 0) completenessPoints += 4;

      // 4. Scheduled Follow-up (0 or 15 pts)
      let followUpPoints = 0;
      if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() >= now - 86400000) {
        followUpPoints = 15;
      }

      // 5. Priority Tier (0 to 10 pts)
      let priorityPoints = 0;
      if (lead.priority === "high") priorityPoints = 10;
      else if (lead.priority === "medium") priorityPoints = 5;

      const rawProbability = scorePoints + recencyPoints + completenessPoints + followUpPoints + priorityPoints;
      const probability = Math.min(100, Math.max(0, rawProbability));

      let tier: ConversionLikelihoodTier = "low";
      if (probability >= 75) tier = "very_high";
      else if (probability >= 55) tier = "high";
      else if (probability >= 35) tier = "moderate";

      const val = lead.expectedValue ? parseFloat(String(lead.expectedValue)) : 0;
      probabilitySum += probability;

      if (probability >= 55) {
        totalHighProbabilityValue += val;
        highProbabilityLeadsCount++;
      }

      summaries.push({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        score: leadScore,
        expectedValue: val,
        conversionProbability: probability,
        likelihoodTier: tier,
        ownerId: lead.ownerId,
      });
    }

    summaries.sort((a, b) => b.conversionProbability - a.conversionProbability);

    const averageConversionProbability = Math.round((probabilitySum / activeLeads.length) * 10) / 10;

    return {
      totalActiveLeads: activeLeads.length,
      averageConversionProbability,
      totalHighProbabilityValue,
      highProbabilityLeadsCount,
      leads: summaries,
    };
  }
}
