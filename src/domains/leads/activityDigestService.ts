import { db } from "@/db";
import { activities, users, leads } from "@/db/schema";
import { and, eq, gte, lt, count } from "drizzle-orm";

export interface RepActivitySummary {
  userId: string;
  userName: string;
  totalActivities: number;
  breakdown: Record<string, number>;
}

export interface DailyActivityDigest {
  date: string;
  totalActivities: number;
  typeBreakdown: Record<string, number>;
  repSummaries: RepActivitySummary[];
}

export class ActivityDigestService {
  /**
   * Generates a daily worklog digest breaking down sales rep activities and message touchpoints.
   */
  static async getDailyActivityDigest(
    organizationId: string,
    targetDateStr?: string
  ): Promise<DailyActivityDigest> {
    let startOfDay: Date;
    let endOfDay: Date;
    let dateFormatted: string;

    if (targetDateStr && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
      const [y, m, d] = targetDateStr.split("-").map(Number);
      startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
      endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
      dateFormatted = targetDateStr;
    } else {
      const now = new Date();
      startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      dateFormatted = startOfDay.toISOString().split("T")[0];
    }

    // Fetch org users
    const orgUsers = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true)));

    if (orgUsers.length === 0) {
      return { date: dateFormatted, totalActivities: 0, typeBreakdown: {}, repSummaries: [] };
    }

    const userIds = orgUsers.map((u) => u.id);
    const userMap: Record<string, string> = {};
    for (const u of orgUsers) {
      userMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
    }

    // Query activities for the date range via direct relationship join
    const actRows = await db
      .select({
        userId: activities.userId,
        type: activities.type,
        count: count(),
      })
      .from(activities)
      .innerJoin(leads, eq(activities.leadId, leads.id))
      .where(
        and(
          eq(leads.organizationId, organizationId),
          gte(activities.createdAt, startOfDay),
          lt(activities.createdAt, endOfDay)
        )
      )
      .groupBy(activities.userId, activities.type);

    const typeBreakdown: Record<string, number> = {};
    const repMap: Record<string, { total: number; breakdown: Record<string, number> }> = {};

    for (const uId of userIds) {
      repMap[uId] = { total: 0, breakdown: {} };
    }

    let totalCount = 0;

    for (const row of actRows) {
      const actType = row.type || "note";
      const actCount = Number(row.count ?? 0);
      totalCount += actCount;

      typeBreakdown[actType] = (typeBreakdown[actType] ?? 0) + actCount;

      if (row.userId && repMap[row.userId]) {
        repMap[row.userId].total += actCount;
        repMap[row.userId].breakdown[actType] = (repMap[row.userId].breakdown[actType] ?? 0) + actCount;
      }
    }

    const repSummaries: RepActivitySummary[] = orgUsers.map((u) => ({
      userId: u.id,
      userName: userMap[u.id],
      totalActivities: repMap[u.id]?.total ?? 0,
      breakdown: repMap[u.id]?.breakdown ?? {},
    }));

    repSummaries.sort((a, b) => b.totalActivities - a.totalActivities);

    return {
      date: dateFormatted,
      totalActivities: totalCount,
      typeBreakdown,
      repSummaries,
    };
  }
}
