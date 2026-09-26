import { db } from "@/db";
import { leads, followUps, leadSources, users, teams, activities } from "@/db/schema";
import { eq, and, gte, lt, lte, desc, isNull, or, sql } from "drizzle-orm";
import { startOfZonedDay, startOfZonedMonth } from "@/lib/tz";

export interface AnalyticsFilters {
  organizationId: string;
  ownerId?: string;
  teamId?: string;
  dateRange?: "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "all";
  startDate?: Date;
  endDate?: Date;
  /** Workspace timezone for "today"/"this month" bounds. Resolved from the org when omitted. */
  timeZone?: string;
}

/**
 * Pure: KPI numbers from per-status totals + response-time stats. Win rate = won out of all resolved
 * leads (unqualified counts as a loss, otherwise disqualifying a lead would flatter the rate).
 * Speed-to-lead uses the MEDIAN first-response time so one lead contacted weeks later doesn't skew it.
 */
export function summarizeLeadMetrics(
  byStatus: { status: string | null; n: number; value: number }[],
  resp: { contacted: number; median: number | null; within5: number },
  catOf: (status: string | null) => string,
) {
  const sum = (cat: string, f: "n" | "value") => byStatus.filter((r) => catOf(r.status) === cat).reduce((a, r) => a + r[f], 0);
  const total = byStatus.reduce((a, r) => a + r.n, 0);
  const newLeads = sum("open", "n");
  const activeLeads = sum("in_progress", "n");
  const won = sum("won", "n");
  const lost = sum("lost", "n");
  const unqualified = sum("unqualified", "n");
  const closed = won + lost + unqualified;
  return {
    total,
    newLeads,
    activeLeads,
    qualified: activeLeads + won,
    unqualified,
    won,
    lost,
    conversionRate: closed > 0 ? (won / closed) * 100 : 0,
    pipelineValue: sum("in_progress", "value"),
    expectedRevenue: sum("won", "value"),
    contacted: resp.contacted,
    contactRate: total > 0 ? (resp.contacted / total) * 100 : 0,
    medianResponseSeconds: resp.median ?? 0,
    within5MinRate: total > 0 ? (resp.within5 / total) * 100 : 0,
  };
}

export class AnalyticsService {
  // "Today", "this month" etc. are the WORKSPACE's calendar days — the server runs in UTC, which
  // put an Indian team's "today" 5½ hours off.
  private static getDateRangeBounds(filters: AnalyticsFilters): { start?: Date; end?: Date } {
    if (filters.startDate || filters.endDate) {
      return { start: filters.startDate, end: filters.endDate };
    }
    if (!filters.dateRange || filters.dateRange === "all") return {};
    const tz = filters.timeZone || "UTC";
    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    switch (filters.dateRange) {
      case "today":
        return { start: startOfZonedDay(now, tz), end: now };
      case "yesterday":
        return { start: startOfZonedDay(now, tz, -1), end: new Date(startOfZonedDay(now, tz).getTime() - 1) };
      case "7d":
        return { start: new Date(now.getTime() - 7 * DAY), end: now };
      case "30d":
        return { start: new Date(now.getTime() - 30 * DAY), end: now };
      case "this_month":
        return { start: startOfZonedMonth(now, tz), end: now };
      case "last_month":
        return { start: startOfZonedMonth(now, tz, -1), end: new Date(startOfZonedMonth(now, tz).getTime() - 1) };
      default:
        return {};
    }
  }

  private static async withTz(filters: AnalyticsFilters): Promise<AnalyticsFilters> {
    if (filters.timeZone || !filters.organizationId) return filters;
    const { getOrgFormat } = await import("@/lib/format.server");
    const { timezone } = await getOrgFormat(filters.organizationId).catch(() => ({ timezone: "UTC" }));
    return { ...filters, timeZone: timezone };
  }

  private static buildLeadConditions(filters: AnalyticsFilters) {
    // Exclude soft-deleted leads (recycle bin) so metrics/charts match the leads list — a deleted
    // lead must drop out of Total Leads and every other count that routes through here.
    const conditions = [isNull(leads.deletedAt)];
    if (filters.organizationId) {
      conditions.push(eq(leads.organizationId, filters.organizationId));
    }
    if (filters.ownerId) {
      conditions.push(eq(leads.ownerId, filters.ownerId));
    }
    if (filters.teamId) {
      conditions.push(eq(leads.teamId, filters.teamId));
    }

    const { start, end } = this.getDateRangeBounds(filters);
    if (start) conditions.push(gte(leads.createdAt, start));
    if (end) conditions.push(lte(leads.createdAt, end));

    return conditions;
  }

  /**
   * Retrieves high-level KPI metrics for leads.
   */
  static async getLeadMetrics(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = this.buildLeadConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Aggregated in Postgres (was: load every lead row just to count them).
    const [byStatus, respRows] = await Promise.all([
      db
        .select({ status: leads.status, n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${leads.expectedValue}), 0)::float` })
        .from(leads)
        .where(where)
        .groupBy(leads.status),
      db.execute<{ contacted: number; median: number | null; within5: number }>(sql`
        select count(*)::int as contacted,
               percentile_cont(0.5) within group (order by secs) as median,
               (count(*) filter (where secs <= 300))::int as within5
        from (
          select extract(epoch from coalesce(${leads.firstContactedAt}, ${leads.lastContactedAt}) - ${leads.createdAt}) as secs
          from ${leads} where ${where}
        ) t
        where secs >= 0`),
    ]);

    // Resolve each status's CATEGORY via the tenant status schema so custom statuses (e.g. a "closed_won"
    // in the won category) are counted correctly.
    const { CustomStatusSchemaService } = await import("@/domains/leads/customStatusSchemaService");
    const catMap = await CustomStatusSchemaService.getStatusCategoryMap(filters.organizationId);
    const resp = (respRows as unknown as { contacted: number; median: number | null; within5: number }[])[0];
    return summarizeLeadMetrics(
      byStatus.map((r) => ({ status: r.status, n: Number(r.n), value: Number(r.value) })),
      { contacted: Number(resp?.contacted ?? 0), median: resp?.median == null ? null : Number(resp.median), within5: Number(resp?.within5 ?? 0) },
      (st) => catMap.get(st ?? "") ?? "open",
    );
  }

  /**
   * Retrieves follow-up specific metrics.
   */
  static async getFollowUpMetrics(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = [eq(leads.organizationId, filters.organizationId), isNull(leads.deletedAt)];
    if (filters.ownerId) {
      // Same scope as the Follow-ups list: ones the user created, or on leads they own.
      conditions.push(or(eq(followUps.userId, filters.ownerId), eq(leads.ownerId, filters.ownerId))!);
    }

    const { start, end } = this.getDateRangeBounds(filters);
    if (start) conditions.push(gte(followUps.createdAt, start));
    if (end) conditions.push(lte(followUps.createdAt, end));

    const now = new Date();
    const endOfToday = startOfZonedDay(now, filters.timeZone || "UTC", 1);
    // Counted in SQL (was: every follow-up row loaded into memory). Overdue and due-today don't
    // overlap: "due today" is what's still ahead today, so the two add up without double counting.
    const [r] = await db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${eq(followUps.status, "completed")})::int`,
        // Column-aware operators, so the Date params get encoded like any other timestamp filter.
        overdue: sql<number>`count(*) filter (where ${and(eq(followUps.status, "pending"), lt(followUps.dueAt, now))})::int`,
        dueToday: sql<number>`count(*) filter (where ${and(eq(followUps.status, "pending"), gte(followUps.dueAt, now), lt(followUps.dueAt, endOfToday))})::int`,
        upcoming: sql<number>`count(*) filter (where ${and(eq(followUps.status, "pending"), gte(followUps.dueAt, endOfToday))})::int`,
      })
      .from(followUps)
      .innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(and(...conditions));

    const total = r?.total ?? 0;
    const completed = r?.completed ?? 0;
    return {
      total,
      dueToday: r?.dueToday ?? 0,
      overdue: r?.overdue ?? 0,
      upcoming: r?.upcoming ?? 0,
      completed,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }

  /**
   * Aggregates leads grouped by lead source name.
   */
  static async getLeadsBySource(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = this.buildLeadConditions(filters);
    const rows = await db
      .select({
        sourceId: leads.sourceId,
        sourceName: leadSources.name,
        expectedValue: leads.expectedValue,
      })
      .from(leads)
      .leftJoin(leadSources, eq(leads.sourceId, leadSources.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const map = new Map<string, { count: number; totalValue: number }>();
    let totalCount = 0;

    for (const r of rows) {
      const name = r.sourceName || "Direct / Organic";
      const val = Number(r.expectedValue || 0);
      const existing = map.get(name) || { count: 0, totalValue: 0 };
      map.set(name, { count: existing.count + 1, totalValue: existing.totalValue + val });
      totalCount++;
    }

    return Array.from(map.entries()).map(([name, stat]) => ({
      name,
      count: stat.count,
      totalValue: stat.totalValue,
      percentage: totalCount > 0 ? Number(((stat.count / totalCount) * 100).toFixed(1)) : 0,
    }));
  }

  /**
   * Backward-compatibility alias for getLeadsBySource.
   */
  static async getRevenueBySource(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const rows = await this.getLeadsBySource(filters);
    return rows.map(r => ({ name: r.name, total: r.totalValue || r.count }));
  }

  /**
   * Aggregates lead counts by pipeline stage.
   */
  static async getPipelineDistribution(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = this.buildLeadConditions(filters);
    const rows = await db
      .select({ status: leads.status })
      .from(leads)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const stageLabels: Record<string, string> = {
      new: "New",
      active: "Active",
      won: "Won",
      lost: "Lost",
      unqualified: "Unqualified",
    };

    const counts: Record<string, number> = {
      New: 0,
      Active: 0,
      Won: 0,
      Lost: 0,
      Unqualified: 0,
    };

    const total = rows.length;
    for (const r of rows) {
      const label = stageLabels[r.status] || r.status;
      counts[label] = (counts[label] || 0) + 1;
    }

    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }));
  }

  /**
   * Aggregates lead counts grouped by lead owner.
   */
  static async getLeadsByOwner(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = this.buildLeadConditions(filters);
    const rows = await db
      .select({
        ownerId: leads.ownerId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(leads)
      .leftJoin(users, eq(leads.ownerId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const map = new Map<string, number>();
    let totalCount = 0;

    for (const r of rows) {
      let name = "Unassigned";
      if (r.firstName || r.lastName) {
        name = [r.firstName, r.lastName].filter(Boolean).join(" ");
      } else if (r.email) {
        name = r.email;
      }
      map.set(name, (map.get(name) || 0) + 1);
      totalCount++;
    }

    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      percentage: totalCount > 0 ? Number(((count / totalCount) * 100).toFixed(1)) : 0,
    }));
  }

  /**
   * Aggregates lead counts grouped by team.
   */
  static async getLeadsByTeam(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = this.buildLeadConditions(filters);
    const rows = await db
      .select({
        teamId: leads.teamId,
        teamName: teams.name,
      })
      .from(leads)
      .leftJoin(teams, eq(leads.teamId, teams.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const map = new Map<string, number>();
    let totalCount = 0;

    for (const r of rows) {
      const name = r.teamName || "No Team";
      map.set(name, (map.get(name) || 0) + 1);
      totalCount++;
    }

    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      percentage: totalCount > 0 ? Number(((count / totalCount) * 100).toFixed(1)) : 0,
    }));
  }

  /**
   * Retrieves recent timeline activity feed for the organization.
   */
  static async getRecentActivity(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const conditions = [eq(leads.organizationId, filters.organizationId)];
    // A rep's "My Recent Activity" covers only their own leads (it listed the whole workspace).
    if (filters.ownerId) conditions.push(eq(leads.ownerId, filters.ownerId));
    const { start, end } = this.getDateRangeBounds(filters);
    if (start) conditions.push(gte(activities.createdAt, start));
    if (end) conditions.push(lte(activities.createdAt, end));

    const rows = await db
      .select({
        id: activities.id,
        leadId: activities.leadId,
        leadName: leads.name,
        userId: activities.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        userEmail: users.email,
        type: activities.type,
        content: activities.content,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .innerJoin(leads, eq(activities.leadId, leads.id))
      .leftJoin(users, eq(activities.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(activities.occurredAt))
      .limit(10);

    return rows.map((r) => {
      let userName = "System";
      if (r.firstName || r.lastName) {
        userName = [r.firstName, r.lastName].filter(Boolean).join(" ");
      } else if (r.userEmail) {
        userName = r.userEmail;
      }

      return {
        id: r.id,
        leadId: r.leadId,
        leadName: r.leadName,
        userName,
        type: r.type,
        content: r.content,
        occurredAt: r.occurredAt,
      };
    });
  }
}
