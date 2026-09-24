import { db } from "@/db";
import { leads, followUps, leadSources, users, teams, activities } from "@/db/schema";
import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";

export interface AnalyticsFilters {
  organizationId: string;
  ownerId?: string;
  teamId?: string;
  dateRange?: "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month" | "all";
  startDate?: Date;
  endDate?: Date;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class AnalyticsService {
  private static getDateRangeBounds(filters: AnalyticsFilters): { start?: Date; end?: Date } {
    if (filters.startDate || filters.endDate) {
      return { start: filters.startDate, end: filters.endDate };
    }
    if (!filters.dateRange || filters.dateRange === "all") {
      return {};
    }

    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (filters.dateRange) {
      case "today":
        start.setHours(0, 0, 0, 0);
        break;
      case "yesterday":
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case "7d":
        start.setDate(now.getDate() - 7);
        break;
      case "30d":
        start.setDate(now.getDate() - 30);
        break;
      case "this_month":
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case "last_month":
        start.setMonth(now.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
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
    const conditions = this.buildLeadConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    
    const allLeads = await db.select().from(leads).where(where);

    // Resolve each lead's CATEGORY via the tenant status schema so custom statuses (e.g. a "closed_won"
    // in the won category) are counted correctly. Base keys map to their own category, so behaviour is
    // unchanged for tenants that never customise.
    const { CustomStatusSchemaService } = await import("@/domains/leads/customStatusSchemaService");
    const catMap = await CustomStatusSchemaService.getStatusCategoryMap(filters.organizationId);
    const catOf = (s: string | null) => catMap.get(s ?? "") ?? "open";

    const total = allLeads.length;
    const newLeads = allLeads.filter(l => catOf(l.status) === 'open').length;
    const activeLeads = allLeads.filter(l => catOf(l.status) === 'in_progress').length;
    const won = allLeads.filter(l => catOf(l.status) === 'won').length;
    const lost = allLeads.filter(l => catOf(l.status) === 'lost').length;
    const unqualified = allLeads.filter(l => catOf(l.status) === 'unqualified').length;
    const qualified = activeLeads + won;
    
    // Win rate = won out of all resolved leads. Unqualified counts as a loss, otherwise disqualifying
    // a lead would flatter the rate (1 won / 0 lost showed a misleading 100%).
    const closed = won + lost + unqualified;
    const conversionRate = closed > 0 ? (won / closed) * 100 : 0;
    
    const pipelineValue = allLeads
      .filter(l => catOf(l.status) === 'in_progress')
      .reduce((sum, l) => sum + Number(l.expectedValue || 0), 0);

    const expectedRevenue = allLeads
      .filter(l => catOf(l.status) === 'won')
      .reduce((sum, l) => sum + Number(l.expectedValue || 0), 0);

    // Speed-to-lead: the core metric for this product. Response time = first
    // contact minus lead creation. Median (not mean) so a single stale lead
    // contacted weeks later doesn't distort the number.
    // (last_contacted_at only as a fallback for rows recorded before first_contacted_at existed)
    const responseSeconds = allLeads
      .flatMap(l => {
        const first = l.firstContactedAt ?? l.lastContactedAt;
        return first ? [(new Date(first).getTime() - new Date(l.createdAt).getTime()) / 1000] : [];
      })
      .filter(s => s >= 0);

    const contacted = responseSeconds.length;
    const contactRate = total > 0 ? (contacted / total) * 100 : 0;
    const medianResponseSeconds = median(responseSeconds);
    const within5MinRate = total > 0
      ? (responseSeconds.filter(s => s <= 300).length / total) * 100
      : 0;

    return {
      total,
      newLeads,
      activeLeads,
      qualified,
      unqualified,
      won,
      lost,
      conversionRate,
      pipelineValue,
      expectedRevenue,
      contacted,
      contactRate,
      medianResponseSeconds,
      within5MinRate
    };
  }

  /**
   * Retrieves follow-up specific metrics.
   */
  static async getFollowUpMetrics(filters: AnalyticsFilters) {
    const conditions = [eq(leads.organizationId, filters.organizationId), isNull(leads.deletedAt)];
    if (filters.ownerId) {
      conditions.push(eq(followUps.userId, filters.ownerId));
    }

    const { start, end } = this.getDateRangeBounds(filters);
    if (start) conditions.push(gte(followUps.createdAt, start));
    if (end) conditions.push(lte(followUps.createdAt, end));
    
    const rows = await db
      .select({ followUp: followUps })
      .from(followUps)
      .innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(and(...conditions));
    
    const allFollowUps = rows.map(r => r.followUp);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    
    const total = allFollowUps.length;
    const completed = allFollowUps.filter(f => f.status === 'completed').length;
    const overdue = allFollowUps.filter(f => f.status === 'pending' && new Date(f.dueAt) < now).length;
    const dueToday = allFollowUps.filter(f => f.status === 'pending' && new Date(f.dueAt) >= startOfToday && new Date(f.dueAt) <= endOfToday).length;
    const upcoming = allFollowUps.filter(f => f.status === 'pending' && new Date(f.dueAt) > endOfToday).length;
    
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    return {
      total,
      dueToday,
      overdue,
      upcoming,
      completed,
      completionRate
    };
  }

  /**
   * Aggregates leads grouped by lead source name.
   */
  static async getLeadsBySource(filters: AnalyticsFilters) {
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
    const rows = await this.getLeadsBySource(filters);
    return rows.map(r => ({ name: r.name, total: r.totalValue || r.count }));
  }

  /**
   * Aggregates lead counts by pipeline stage.
   */
  static async getPipelineDistribution(filters: AnalyticsFilters) {
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
    const conditions = [eq(leads.organizationId, filters.organizationId)];
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
