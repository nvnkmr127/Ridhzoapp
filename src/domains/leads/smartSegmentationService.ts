import { db } from "@/db";
import { CustomStatusSchemaService } from "./customStatusSchemaService";
import { HOT_MIN, PROBABILITY } from "./leadConversionPredictorService";
import { leads } from "@/db/schema";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

export type SmartSegmentKey =
  | "hot_leads"
  | "high_value_at_risk"
  | "unassigned_new"
  | "stale_high_priority";

export const SMART_SEGMENT_KEYS: SmartSegmentKey[] = ["hot_leads", "high_value_at_risk", "unassigned_new", "stale_high_priority"];

export interface SmartSegmentSummary {
  key: SmartSegmentKey;
  title: string;
  description: string;
  count: number;
}

/** "High value" threshold, in the workspace's own currency. */
export const HIGH_VALUE_MIN = 10_000;

const inKeys = (keys: string[]) => (keys.length ? inArray(leads.status, keys) : sql`false`);
const quietFor7Days = sql`coalesce(${leads.lastContactedAt}, ${leads.createdAt}) < (now() at time zone 'utc') - interval '7 days'`;

export class SmartSegmentationService {
  /**
   * The SQL condition behind each segment. The chip counts AND the list a chip opens
   * (`/leads?segment=…` → LeadService.listLeads) both use these, so the numbers always match.
   * hot_leads mirrors the Hot Leads page (probability >= HOT_MIN, or recently opened content).
   */
  static async conditions(organizationId: string, engagedIds: string[] = []): Promise<Record<SmartSegmentKey, SQL>> {
    const keys = await CustomStatusSchemaService.getStatusKeysByCategory(organizationId);
    const open = [...keys.open, ...keys.in_progress];
    return {
      hot_leads: and(inKeys(open), sql`(${PROBABILITY} >= ${HOT_MIN} or ${engagedIds.length ? inArray(leads.id, engagedIds) : sql`false`})`)!,
      high_value_at_risk: and(inKeys(open), sql`coalesce(${leads.expectedValue}, 0) >= ${HIGH_VALUE_MIN}`, quietFor7Days)!,
      unassigned_new: and(inKeys(keys.open), isNull(leads.ownerId))!,
      stale_high_priority: and(inKeys(open), eq(leads.priority, "high"), quietFor7Days)!,
    };
  }

  /**
   * Segment counts in ONE aggregate query (was: every lead of the tenant loaded into Node, including
   * recycle-bin rows). Reps pass enforceOwnerId so they only count leads they can open.
   */
  static async getSmartSegments(
    organizationId: string,
    opts: { enforceOwnerId?: string; engagedIds?: string[]; highValueLabel?: string } = {},
  ): Promise<SmartSegmentSummary[]> {
    const c = await this.conditions(organizationId, opts.engagedIds);
    const n = (cond: SQL) => sql<number>`(count(*) filter (where ${cond}))::int`;
    const [row] = await db
      .select({
        hot_leads: n(c.hot_leads),
        high_value_at_risk: n(c.high_value_at_risk),
        unassigned_new: n(c.unassigned_new),
        stale_high_priority: n(c.stale_high_priority),
      })
      .from(leads)
      .where(and(
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt),
        opts.enforceOwnerId ? eq(leads.ownerId, opts.enforceOwnerId) : undefined,
      ));
    const count = (k: SmartSegmentKey) => Number(row?.[k] ?? 0);
    const highValue = opts.highValueLabel ?? HIGH_VALUE_MIN.toLocaleString();

    return [
      {
        key: "hot_leads",
        title: "Hot & Highly Engaged",
        description: "Open leads most likely to convert, or that just opened content you shared",
        count: count("hot_leads"),
      },
      {
        key: "high_value_at_risk",
        title: "High Value Deals At Risk",
        description: `Open deals worth ${highValue} or more with no contact for over 7 days`,
        count: count("high_value_at_risk"),
      },
      {
        key: "unassigned_new",
        title: "Unassigned New Leads",
        description: "New incoming leads without an assigned sales owner",
        count: count("unassigned_new"),
      },
      {
        key: "stale_high_priority",
        title: "Stale High Priority Leads",
        description: "High priority open leads with no contact for over 7 days",
        count: count("stale_high_priority"),
      },
    ];
  }
}
