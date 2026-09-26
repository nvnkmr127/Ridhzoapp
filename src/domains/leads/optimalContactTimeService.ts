import { db } from "@/db";
import { activities, leads } from "@/db/schema";
import { and, eq, or, like, sql } from "drizzle-orm";
import { zonedParts } from "@/lib/tz";

export interface HourlyDistribution {
  hour: number;
  label: string;
  count: number;
}

export interface DailyDistribution {
  dayName: string;
  count: number;
}

export interface OptimalContactTimeMetrics {
  totalTouchpointsAnalyzed: number;
  bestHourOfDayLabel: string;
  bestDayOfWeek: string;
  hourlyDistribution: HourlyDistribution[];
  dailyDistribution: DailyDistribution[];
}

const DAYS_MAP = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export class OptimalContactTimeService {
  /**
   * When do leads actually ENGAGE — reply on WhatsApp or pick up a call — by hour and weekday in the
   * workspace timezone. (Previously every activity counted, including system notes, in server UTC.)
   */
  static async getOptimalContactTimes(organizationId: string, timeZone?: string): Promise<OptimalContactTimeMetrics> {
    let tz = timeZone;
    if (!tz) {
      const { getOrgFormat } = await import("@/lib/format.server");
      tz = (await getOrgFormat(organizationId).catch(() => null))?.timezone ?? "UTC";
    }
    const actRows = await db
      .select({ at: activities.occurredAt })
      .from(activities)
      .innerJoin(leads, eq(activities.leadId, leads.id))
      .where(
        and(
          eq(leads.organizationId, organizationId),
          or(
            and(eq(activities.type, "call"), sql`(coalesce(${activities.durationSec}, 0) > 0 or ${activities.content} like 'Called — Answered%')`), // connected, incl. synced + incoming
            and(eq(activities.type, "message"), like(activities.content, "[whatsapp ← lead]%")),
            like(activities.content, "Lead replied%"), // replies reps log from personal WhatsApp / email
          ),
        ),
      );

    if (actRows.length === 0) {
      return {
        totalTouchpointsAnalyzed: 0,
        bestHourOfDayLabel: "10:00 AM - 11:00 AM",
        bestDayOfWeek: "Tuesday",
        hourlyDistribution: [],
        dailyDistribution: [],
      };
    }

    const hoursCounts = new Array(24).fill(0);
    const daysCounts = new Array(7).fill(0);

    for (const act of actRows) {
      const p = zonedParts(new Date(act.at), tz); // when the call happened, not when it was logged
      hoursCounts[p.hour]++;
      daysCounts[p.weekday]++;
    }

    const totalTouchpointsAnalyzed = actRows.length;

    let maxHourIdx = 10;
    let maxHourVal = -1;
    for (let h = 0; h < 24; h++) {
      if (hoursCounts[h] > maxHourVal) {
        maxHourVal = hoursCounts[h];
        maxHourIdx = h;
      }
    }

    let maxDayIdx = 2; // Default Tuesday
    let maxDayVal = -1;
    for (let d = 0; d < 7; d++) {
      if (daysCounts[d] > maxDayVal) {
        maxDayVal = daysCounts[d];
        maxDayIdx = d;
      }
    }

    const formatHourLabel = (h: number) => {
      const startPeriod = h >= 12 ? "PM" : "AM";
      const displayStart = h % 12 === 0 ? 12 : h % 12;
      const nextH = (h + 1) % 24;
      const endPeriod = nextH >= 12 ? "PM" : "AM";
      const displayEnd = nextH % 12 === 0 ? 12 : nextH % 12;
      return `${displayStart}:00 ${startPeriod} - ${displayEnd}:00 ${endPeriod}`;
    };

    const bestHourOfDayLabel = formatHourLabel(maxHourIdx);
    const bestDayOfWeek = DAYS_MAP[maxDayIdx];

    const hourlyDistribution: HourlyDistribution[] = hoursCounts.map((count, hour) => ({
      hour,
      label: formatHourLabel(hour),
      count,
    }));

    const dailyDistribution: DailyDistribution[] = daysCounts.map((count, dayIdx) => ({
      dayName: DAYS_MAP[dayIdx],
      count,
    }));

    return {
      totalTouchpointsAnalyzed,
      bestHourOfDayLabel,
      bestDayOfWeek,
      hourlyDistribution,
      dailyDistribution,
    };
  }
}
