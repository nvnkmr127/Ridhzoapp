import { db } from "@/db";
import { activities, leads } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

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
   * Analyzes activity timestamps to identify optimal outreach hours and days for maximum conversion.
   */
  static async getOptimalContactTimes(organizationId: string, knownLeadIds?: string[]): Promise<OptimalContactTimeMetrics> {
    let leadIds: string[];
    if (knownLeadIds !== undefined) {
      leadIds = knownLeadIds;
    } else {
      const orgLeads = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.organizationId, organizationId));
      leadIds = orgLeads.map((l) => l.id);
    }

    if (leadIds.length === 0) {
      return {
        totalTouchpointsAnalyzed: 0,
        bestHourOfDayLabel: "10:00 AM - 11:00 AM",
        bestDayOfWeek: "Tuesday",
        hourlyDistribution: [],
        dailyDistribution: [],
      };
    }

    const actRows = await db
      .select({ createdAt: activities.createdAt })
      .from(activities)
      .where(inArray(activities.leadId, leadIds));

    const hoursCounts = new Array(24).fill(0);
    const daysCounts = new Array(7).fill(0);

    for (const act of actRows) {
      const date = new Date(act.createdAt);
      hoursCounts[date.getHours()]++;
      daysCounts[date.getDay()]++;
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
