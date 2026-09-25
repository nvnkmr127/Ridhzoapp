// Business days/hours in the org's timezone. days: 0=Sun … 6=Sat. end is exclusive (20 = until 8 PM).

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localDayHour(now: Date, timeZone: string): { day: number; hour: number } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: WEEKDAY[get("weekday")] ?? 0, hour: Number(get("hour")) };
}

export function isWorkDay(now: Date, timeZone: string, days: number[] | null | undefined): boolean {
  if (!days?.length) return true; // nothing configured = every day
  return days.includes(localDayHour(now, timeZone).day);
}

export function isWorkingTime(
  now: Date,
  timeZone: string,
  org: { workDays?: number[] | null; workStartHour?: number | null; workEndHour?: number | null },
): boolean {
  if (!isWorkDay(now, timeZone, org.workDays)) return false;
  const start = org.workStartHour ?? 0;
  const end = org.workEndHour ?? 24;
  if (start >= end) return true; // misconfigured → don't silently mute alerts
  const { hour } = localDayHour(now, timeZone);
  return hour >= start && hour < end;
}
