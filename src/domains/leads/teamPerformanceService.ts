import { db } from "@/db";
import { CustomStatusSchemaService } from "./customStatusSchemaService";
import { leads, users, followUps, activities } from "@/db/schema";
import { and, eq, gte, inArray, count, sum } from "drizzle-orm";
import { answerRate, callCounts } from "./callStats";

export interface RepPerformanceMetric {
  userId: string;
  name: string;
  email: string;
  totalAssignedLeads: number;
  wonLeads: number;
  winRatePercentage: number;
  totalRevenue: number;
  completedFollowUps: number;
  calls: number; // logged calls (manual + phone call log)
  talkTimeSec: number; // from the Android call log; manual logs carry no duration
  answerRate: number | null; // % of outgoing calls answered; null = no outgoing calls
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
    const { cat } = await CustomStatusSchemaService.resolver(organizationId); // custom statuses count by category
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

    // Calls per rep, by when the call happened.
    const callConditions = [eq(activities.type, "call"), inArray(activities.userId, userIds)];
    if (startDate) callConditions.push(gte(activities.occurredAt, startDate));
    const callRows = await db
      .select({ userId: activities.userId, count: count(), talk: sum(activities.durationSec), ...callCounts })
      .from(activities)
      .where(and(...callConditions))
      .groupBy(activities.userId);
    const callsMap = new Map(callRows.map((r) => [r.userId, { calls: Number(r.count), talk: Number(r.talk ?? 0), rate: answerRate(Number(r.answered ?? 0), Number(r.attempts ?? 0)) }]));

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
        if (cat(l.status) === "won") {
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
        calls: callsMap.get(u.id)?.calls ?? 0,
        talkTimeSec: callsMap.get(u.id)?.talk ?? 0,
        answerRate: callsMap.get(u.id)?.rate ?? null,
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
