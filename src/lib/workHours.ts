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

// A wall-clock time in `timeZone` ("2026-10-05" at 10:30 in Asia/Kolkata) → the real instant.
// Needed wherever a person picks a time for the business (booking page): the server runs in UTC,
// so parsing "2026-10-05T10:30" there lands 5½ hours off for India.
export function wallTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Offset of the zone at that moment (what the zone's clock reads minus UTC), applied twice so a
  // DST change between the guess and the answer settles correctly.
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60_000) * 60_000;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

// The org-local calendar date ("YYYY-MM-DD") of an instant.
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
