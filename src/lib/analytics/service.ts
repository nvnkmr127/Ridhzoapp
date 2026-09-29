import { db } from "@/db";
import { leads, followUps, leadSources, users, teams, activities } from "@/db/schema";
import { eq, and, gte, lt, lte, desc, isNull, or, sql } from "drizzle-orm";
import { dayKey, startOfZonedDay, startOfZonedMonth } from "@/lib/tz";
import { cache } from "react";

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

/** Pure: every workspace-local calendar day from start to end, as YYYY-MM-DD. */
export function dayKeysBetween(start: Date, end: Date, tz: string): string[] {
  const days: string[] = [];
  const last = dayKey(end, tz);
  for (let i = 0; i < 400; i++) {
    const k = dayKey(startOfZonedDay(start, tz, i), tz);
    days.push(k);
    if (k >= last) break;
  }
  return days;
}

export class AnalyticsService {
  // Per-request hand-off: the dashboard needs lead KPIs and the pipeline breakdown, which read the
  // same per-status counts. getLeadMetrics stores its rows here; getPipelineDistribution in the
  // same request reuses them instead of re-running the identical GROUP BY. cache() scopes the box
  // to one request, so nothing leaks across requests or callers.
  // Keyed by the filters that produced it: the dashboard also reads the PREVIOUS period, and an
  // unkeyed box let the pipeline chart pick up whichever period was computed last.
  private static readonly requestStatusRows = cache(
    () => new Map<string, { status: string | null; n: number; value: number }[]>(),
  );
  private static memoKey(f: AnalyticsFilters) {
    return JSON.stringify([f.organizationId, f.ownerId, f.teamId, f.dateRange, f.startDate?.getTime(), f.endDate?.getTime(), f.timeZone]);
  }

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

  /** The resolved window of a filter set (workspace timezone); both undefined for "all time". */
  static async bounds(filters: AnalyticsFilters) {
    return this.getDateRangeBounds(await this.withTz(filters));
  }

  /**
   * The same-length window immediately before this one ("last 30 days" → the 30 days before that),
   * for "vs previous period" deltas. Null for all-time, which has nothing before it.
   */
  static async previousPeriod(filters: AnalyticsFilters): Promise<AnalyticsFilters | null> {
    const f = await this.withTz(filters);
    const { start, end } = this.getDateRangeBounds(f);
    if (!start || !end) return null;
    const len = end.getTime() - start.getTime();
    return { ...f, dateRange: undefined, startDate: new Date(start.getTime() - len - 1), endDate: new Date(start.getTime() - 1) };
  }

  /** Deals WON inside the window (by won date, not creation date) and their value. */
  static async getWonSummary(filters: AnalyticsFilters): Promise<{ count: number; value: number }> {
    filters = await this.withTz(filters);
    const [row] = await db
      .select({ n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${leads.expectedValue}), 0)::float` })
      .from(leads)
      .where(and(...this.wonConditions(filters)));
    return { count: Number(row?.n ?? 0), value: Number(row?.value ?? 0) };
  }

  private static wonConditions(filters: AnalyticsFilters) {
    const c = [isNull(leads.deletedAt), eq(leads.organizationId, filters.organizationId), sql`${leads.wonAt} is not null`];
    if (filters.ownerId) c.push(eq(leads.ownerId, filters.ownerId));
    if (filters.teamId) c.push(eq(leads.teamId, filters.teamId));
    const { start, end } = this.getDateRangeBounds(filters);
    if (start) c.push(gte(leads.wonAt, start));
    if (end) c.push(lte(leads.wonAt, end));
    return c;
  }

  /**
   * New leads and deals won per workspace-local day across the window. All-time is capped to the
   * last 90 days (a multi-year daily chart is unreadable). Missing days are filled with zeros.
   */
  static async getDailyTrend(filters: AnalyticsFilters): Promise<{ day: string; leads: number; won: number }[]> {
    filters = await this.withTz(filters);
    const tz = filters.timeZone || "UTC";
    let { start, end } = this.getDateRangeBounds(filters);
    end ??= new Date();
    start ??= startOfZonedDay(end, tz, -89);
    const f = { ...filters, dateRange: undefined, startDate: start, endDate: end };
    // GROUP BY 1 (position): tz is a bind parameter, so the SELECT and GROUP BY copies of this
    // expression get different $n and Postgres refuses to treat them as the same.
    const localDay = (col: typeof leads.createdAt | typeof leads.wonAt) => sql<string>`to_char((${col} at time zone 'UTC') at time zone ${tz}, 'YYYY-MM-DD')`;
    const [created, won] = await Promise.all([
      db.select({ day: localDay(leads.createdAt), n: sql<number>`count(*)::int` }).from(leads)
        .where(and(...this.buildLeadConditions(f))).groupBy(sql`1`),
      db.select({ day: localDay(leads.wonAt), n: sql<number>`count(*)::int` }).from(leads)
        .where(and(...this.wonConditions(f))).groupBy(sql`1`),
    ]);
    const byDay = (rows: { day: string; n: number }[]) => new Map(rows.map((r) => [r.day, Number(r.n)]));
    const c = byDay(created), w = byDay(won);
    return dayKeysBetween(start, end, tz).map((day) => ({ day, leads: c.get(day) ?? 0, won: w.get(day) ?? 0 }));
  }

  /** The lead scope every dashboard chart uses (org, not deleted, owner/team, date range in the workspace tz). */
  static async leadWhere(filters: AnalyticsFilters) {
    return and(...this.buildLeadConditions(await this.withTz(filters)));
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
    const statusRows = byStatus.map((r) => ({ status: r.status, n: Number(r.n), value: Number(r.value) }));
    this.requestStatusRows().set(this.memoKey(filters), statusRows); // the pipeline breakdown reuses these in this request
    return summarizeLeadMetrics(
      statusRows,
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

    // The date range scopes the period totals (created / completed in it). Overdue, due today and
    // upcoming describe NOW, so they ignore it — "Today" used to show only overdue follow-ups that
    // happened to be created today.
    const { start, end } = this.getDateRangeBounds(filters);
    const inRange = and(start ? gte(followUps.createdAt, start) : undefined, end ? lte(followUps.createdAt, end) : undefined) ?? sql`true`;

    const now = new Date();
    const endOfToday = startOfZonedDay(now, filters.timeZone || "UTC", 1);
    // Counted in SQL (was: every follow-up row loaded into memory). Overdue and due-today don't
    // overlap: "due today" is what's still ahead today, so the two add up without double counting.
    const [r] = await db
      .select({
        total: sql<number>`count(*) filter (where ${inRange})::int`,
        completed: sql<number>`count(*) filter (where ${and(inRange, eq(followUps.status, "completed"))})::int`,
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
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${leads.expectedValue}), 0)::float`,
      })
      .from(leads)
      .leftJoin(leadSources, eq(leads.sourceId, leadSources.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(leads.sourceId, leadSources.name);

    const map = new Map<string, { count: number; totalValue: number }>();
    let totalCount = 0;

    for (const r of rows) {
      const name = r.sourceName || "Direct / Organic";
      const val = Number(r.totalValue ?? 0);
      const count = Number(r.count ?? 1);
      const existing = map.get(name) || { count: 0, totalValue: 0 };
      map.set(name, { count: existing.count + count, totalValue: existing.totalValue + val });
      totalCount += count;
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
   * Aggregates lead counts by pipeline stage. Reuses the per-status rows getLeadMetrics already
   * fetched in this request when they're available (same dashboard fetch), else queries.
   */
  static async getPipelineDistribution(filters: AnalyticsFilters) {
    filters = await this.withTz(filters);
    const memo = this.requestStatusRows().get(this.memoKey(filters));
    if (memo) return this.pipelineFromStatusRows(memo);

    const conditions = this.buildLeadConditions(filters);
    const rows = await db
      .select({ status: leads.status, count: sql<number>`count(*)::int` })
      .from(leads)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(leads.status);

    return this.pipelineFromStatusRows(rows.map((r) => ({ status: r.status, n: Number((r as { count?: number }).count ?? 1) })));
  }

  private static pipelineFromStatusRows(rows: { status: string | null; n: number }[]) {
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

    let total = 0;
    for (const r of rows) {
      const label = stageLabels[r.status ?? ""] || r.status || "";
      const count = r.n;
      counts[label] = (counts[label] || 0) + count;
      total += count;
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
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .leftJoin(users, eq(leads.ownerId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(leads.ownerId, users.firstName, users.lastName, users.email);

    const map = new Map<string, number>();
    let totalCount = 0;

    for (const r of rows) {
      let name = "Unassigned";
      if (r.firstName || r.lastName) {
        name = [r.firstName, r.lastName].filter(Boolean).join(" ");
      } else if (r.email) {
        name = r.email;
      }
      const count = Number((r as any).count ?? 1);
      map.set(name, (map.get(name) || 0) + count);
      totalCount += count;
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
