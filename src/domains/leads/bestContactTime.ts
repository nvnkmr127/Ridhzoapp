// When does THIS lead engage? Pure: buckets the moments they replied / picked up into parts of the
// day (in the workspace timezone) and returns the busiest one. Needs at least 2 signals in the
// winning window — one reply isn't a pattern.

const WINDOWS = [
  { key: "morning", label: "Mornings (8 AM–12 PM)", from: 8, to: 12 },
  { key: "afternoon", label: "Afternoons (12–5 PM)", from: 12, to: 17 },
  { key: "evening", label: "Evenings (5–9 PM)", from: 17, to: 21 },
  { key: "night", label: "Late evenings (after 9 PM)", from: 21, to: 24 },
] as const;

export interface ContactWindow {
  label: string;
  count: number; // signals in the winning window
  total: number; // all signals considered
  days?: "weekdays" | "weekends";
}

export function bestContactWindow(times: Date[], timeZone = "UTC"): ContactWindow | null {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short" });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", hourCycle: "h23", weekday: "short" });
  }
  const counts = new Map<string, number>();
  let weekend = 0;
  for (const t of times) {
    const parts = fmt.formatToParts(t);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const day = parts.find((p) => p.type === "weekday")?.value;
    if (day === "Sat" || day === "Sun") weekend++;
    const w = WINDOWS.find((x) => hour >= x.from && hour < x.to);
    if (w) counts.set(w.key, (counts.get(w.key) ?? 0) + 1); // 12–8 AM ignored: not a time to call
  }
  let best: (typeof WINDOWS)[number] | null = null;
  for (const w of WINDOWS) if ((counts.get(w.key) ?? 0) > (best ? counts.get(best.key) ?? 0 : 0)) best = w;
  const count = best ? counts.get(best.key) ?? 0 : 0;
  if (!best || count < 2) return null;
  const total = times.length;
  const days = weekend / total >= 0.8 ? "weekends" : weekend / total <= 0.2 ? "weekdays" : undefined;
  return { label: best.label, count, total, days };
}
