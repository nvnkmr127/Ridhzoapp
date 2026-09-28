// Field-level conflict check for edits made offline on the phone. The app sends, next to the patch,
// `base`: the value each changed field had when the rep edited it. A field conflicts only when the
// server's value moved away from that base (someone else changed it) AND differs from the rep's new
// value — so non-overlapping edits merge, and the same edit made twice isn't a conflict.

// Stored in customData rather than as columns.
const IN_CUSTOM_DATA = new Set(["budget", "location", "industry", "companySize", "websiteUrl"]);

type Values = Record<string, unknown> & { customData?: Record<string, unknown> };
export type LeadConflict = { field: string; server: unknown };

// "", null and missing all mean "empty".
const norm = (v: unknown) => (v === undefined || v === null || v === "" ? null : JSON.stringify(v));

export function leadConflicts(current: Values, patch: Values, base: Values): LeadConflict[] {
  const custom = (current.customData ?? {}) as Record<string, unknown>;
  const out: LeadConflict[] = [];
  const check = (field: string, server: unknown, mine: unknown, was: unknown) => {
    if (norm(server) !== norm(was) && norm(server) !== norm(mine)) out.push({ field, server: server ?? null });
  };
  for (const [k, was] of Object.entries(base)) {
    if (k === "customData" || !(k in patch)) continue;
    check(k, IN_CUSTOM_DATA.has(k) ? custom[k] ?? current[k] : current[k], patch[k], was);
  }
  for (const [k, was] of Object.entries(base.customData ?? {})) {
    if (patch.customData && k in patch.customData) check(`customData.${k}`, custom[k], patch.customData[k], was);
  }
  return out;
}
