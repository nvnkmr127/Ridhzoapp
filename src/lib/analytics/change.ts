// "vs previous period" for a headline number. `kind` "pct" = relative change (counts, money);
// "pts" = absolute change in percentage points (rates). `lowerIsBetter` flips the colour
// (e.g. response time). Null when there's nothing to compare against.
export type Change = { text: string; good: boolean | null };

export function periodChange(cur: number, prev: number | null | undefined, kind: "pct" | "pts", lowerIsBetter = false): Change | null {
  if (prev == null) return null;
  const d = kind === "pts" ? cur - prev : prev === 0 ? (cur === 0 ? 0 : Infinity) : ((cur - prev) / prev) * 100;
  if (d === 0) return { text: "no change vs previous period", good: null };
  const arrow = d > 0 ? "▲" : "▼";
  const size = d === Infinity ? "new" : kind === "pts" ? `${Math.abs(d).toFixed(1)} pts` : `${Math.abs(d).toFixed(0)}%`;
  return { text: `${arrow} ${size} vs previous period`, good: d > 0 !== lowerIsBetter };
}
