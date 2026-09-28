import { db } from "@/db";
import { CustomStatusSchemaService } from "./customStatusSchemaService";
import { leads } from "@/db/schema";
import { and, desc, eq, inArray, isNull, sql, type AnyColumn } from "drizzle-orm";

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
  /** Leads worth acting on: probability >= HOT_MIN, or recently opened content. */
  hotCount: number;
  /** One page of hot leads, content-openers first, then by probability. */
  leads: HighProbabilityLeadSummary[];
}

export const HOT_MIN = 35;
const HIGH_MIN = 55;

export function tierFor(probability: number): ConversionLikelihoodTier {
  if (probability >= 75) return "very_high";
  if (probability >= HIGH_MIN) return "high";
  if (probability >= HOT_MIN) return "moderate";
  return "low";
}

// Conversion probability (0-100), computed in Postgres so the page never loads every open lead into
// Node. Terms: score (0-30) + contact recency (0-25) + profile completeness (0-20) + follow-up
// scheduled (0/15) + priority (0-10). Timestamps are naive UTC.
const NOW = sql`(now() at time zone 'utc')`;
const DAYS = sql`floor(extract(epoch from (${NOW} - coalesce(${leads.lastContactedAt}, ${leads.createdAt}))) / 86400)`;
const filled = (col: AnyColumn) => sql`(case when coalesce(${col}, '') <> '' then 4 else 0 end)`;
export const PROBABILITY = sql<number>`least(100, greatest(0,
  least(30, greatest(0, floor(coalesce(${leads.score}, 0) * 0.3)))
  + (case when ${DAYS} <= 1 then 25 when ${DAYS} <= 3 then 20 when ${DAYS} <= 7 then 14 when ${DAYS} <= 14 then 7 else 0 end)
  + ${filled(leads.name)} + ${filled(leads.phone)} + ${filled(leads.email)} + ${filled(leads.company)}
  + (case when coalesce(${leads.expectedValue}, 0) > 0 then 4 else 0 end)
  + (case when ${leads.nextFollowUpAt} >= ${NOW} - interval '1 day' then 15 else 0 end)
  + (case ${leads.priority} when 'high' then 10 when 'medium' then 5 else 0 end)
))::int`;

export class LeadConversionPredictorService {
  /**
   * Summary numbers over every open lead (aggregated in SQL) plus one page of hot leads.
   */
  static async getConversionPredictions(
    organizationId: string,
    enforceOwnerId?: string,
    opts: { engagedIds?: string[]; limit?: number; offset?: number } = {},
  ): Promise<LeadConversionPredictionReport> {
    const { openKeys } = await CustomStatusSchemaService.resolver(organizationId); // custom statuses count by category
    const engaged = opts.engagedIds ?? [];
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);

    const where = and(
      eq(leads.organizationId, organizationId),
      isNull(leads.deletedAt),
      openKeys.length ? inArray(leads.status, openKeys) : sql`false`,
      enforceOwnerId ? eq(leads.ownerId, enforceOwnerId) : undefined,
    );
    const isEngaged = engaged.length ? inArray(leads.id, engaged) : sql`false`;
    const isHot = sql`(${PROBABILITY} >= ${HOT_MIN} or ${isEngaged})`;

    const [[agg], rows] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          avg: sql<number>`coalesce(avg(${PROBABILITY}), 0)::float`,
          highCount: sql<number>`(count(*) filter (where ${PROBABILITY} >= ${HIGH_MIN}))::int`,
          highValue: sql<number>`coalesce(sum(${leads.expectedValue}) filter (where ${PROBABILITY} >= ${HIGH_MIN}), 0)::float`,
          hotCount: sql<number>`(count(*) filter (where ${isHot}))::int`,
        })
        .from(leads)
        .where(where),
      db
        .select({
          id: leads.id,
          name: leads.name,
          phone: leads.phone,
          email: leads.email,
          status: leads.status,
          score: leads.score,
          expectedValue: leads.expectedValue,
          ownerId: leads.ownerId,
          probability: PROBABILITY,
        })
        .from(leads)
        .where(and(where, isHot))
        // Content-openers first. (Only when there are any: Postgres rejects a constant ORDER BY key.)
        .orderBy(...(engaged.length ? [desc(isEngaged)] : []), desc(PROBABILITY), leads.id)
        .limit(limit)
        .offset(offset),
    ]);

    return {
      totalActiveLeads: Number(agg?.total ?? 0),
      averageConversionProbability: Math.round(Number(agg?.avg ?? 0) * 10) / 10,
      totalHighProbabilityValue: Number(agg?.highValue ?? 0),
      highProbabilityLeadsCount: Number(agg?.highCount ?? 0),
      hotCount: Number(agg?.hotCount ?? 0),
      leads: rows.map((r) => {
        const p = Number(r.probability);
        return {
          id: r.id,
          name: r.name,
          phone: r.phone,
          email: r.email,
          status: r.status,
          score: r.score ?? 0,
          expectedValue: r.expectedValue ? parseFloat(String(r.expectedValue)) : 0,
          conversionProbability: p,
          likelihoodTier: tierFor(p),
          ownerId: r.ownerId,
        };
      }),
    };
  }
}
