import { db } from "@/db";
import { leads, users, followUps } from "@/db/schema";
import { and, eq, gte, inArray, count } from "drizzle-orm";

export interface RepPerformanceMetric {
  userId: string;
  name: string;
  email: string;
  totalAssignedLeads: number;
  wonLeads: number;
  winRatePercentage: number;
  totalRevenue: number;
  completedFollowUps: number;
  rank: number;
}

export class TeamPerformanceService {
  /**
   * Computes sales leaderboard and performance metrics per rep for an organization.
   * @param organizationId Tenant identifier
   * @param periodDays Optional filtering window in days (default: all-time or last N days)
   */
  static async getTeamLeaderboard(
    organizationId: string,
    periodDays?: number,
    preloadedUsers?: { id: string; email: string; firstName: string | null; lastName: string | null }[]
  ): Promise<RepPerformanceMetric[]> {
    const orgUsers = preloadedUsers ?? await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true)));

    if (orgUsers.length === 0) return [];

    const userIds = orgUsers.map((u) => u.id);
    const startDate = periodDays ? new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) : null;

    const leadConditions = [
      eq(leads.organizationId, organizationId),
      inArray(leads.ownerId, userIds),
    ];
    if (startDate) {
      leadConditions.push(gte(leads.createdAt, startDate));
    }

    const orgLeads = await db
      .select({
        id: leads.id,
        ownerId: leads.ownerId,
        status: leads.status,
        expectedValue: leads.expectedValue,
      })
      .from(leads)
      .where(and(...leadConditions));

    // Completed follow-ups per rep
    const fupConditions = [
      eq(followUps.status, "completed"),
      inArray(followUps.userId, userIds),
    ];
    if (startDate) {
      fupConditions.push(gte(followUps.createdAt, startDate));
    }

    const completedFups = await db
      .select({
        userId: followUps.userId,
        count: count(),
      })
      .from(followUps)
      .where(and(...fupConditions))
      .groupBy(followUps.userId);

    const fupsMap: Record<string, number> = {};
    for (const row of completedFups) {
      if (row.userId) {
        fupsMap[row.userId] = Number(row.count);
      }
    }

    const statsMap: Record<
      string,
      { total: number; won: number; revenue: number }
    > = {};

    for (const u of orgUsers) {
      statsMap[u.id] = { total: 0, won: 0, revenue: 0 };
    }

    for (const l of orgLeads) {
      if (l.ownerId && statsMap[l.ownerId]) {
        statsMap[l.ownerId].total += 1;
        if (l.status === "won") {
          statsMap[l.ownerId].won += 1;
          const val = Number(l.expectedValue ?? 0);
          statsMap[l.ownerId].revenue += isNaN(val) ? 0 : val;
        }
      }
    }

    const leaderboard: RepPerformanceMetric[] = orgUsers.map((u) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
      const stats = statsMap[u.id] ?? { total: 0, won: 0, revenue: 0 };
      const winRatePercentage =
        stats.total > 0 ? Math.round((stats.won / stats.total) * 1000) / 10 : 0;
      const completedFollowUps = fupsMap[u.id] ?? 0;

      return {
        userId: u.id,
        name,
        email: u.email,
        totalAssignedLeads: stats.total,
        wonLeads: stats.won,
        winRatePercentage,
        totalRevenue: stats.revenue,
        completedFollowUps,
        rank: 0,
      };
    });

    leaderboard.sort((a, b) => b.totalRevenue - a.totalRevenue || b.wonLeads - a.wonLeads);

    leaderboard.forEach((rep, idx) => {
      rep.rank = idx + 1;
    });

    return leaderboard;
  }
}
