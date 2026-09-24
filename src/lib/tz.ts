// Workspace-timezone calendar math without a tz library. Servers run in UTC, so "today", "this
// month" and "10 AM" must be computed in the organisation's timezone, not the host's.

function safeTz(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** Wall-clock parts of `date` in `timeZone`. month is 1-12. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz(timeZone),
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second"), weekday };
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function dayKey(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant when the wall clock in `timeZone` reads y-m-d hh:mm (month 1-12; day/month may overflow). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, timeZone = "UTC"): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset across DST changes.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(ts), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    ts = guess - (asUtc - ts);
  }
  return new Date(ts);
}

/** Start of the local day containing `date`, shifted by `addDays`. */
export function startOfZonedDay(date: Date, timeZone: string, addDays = 0): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day + addDays, 0, 0, timeZone);
}

/** Start of the local month containing `date`, shifted by `addMonths`. */
export function startOfZonedMonth(date: Date, timeZone: string, addMonths = 0): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month + addMonths, 1, 0, 0, timeZone);
}
