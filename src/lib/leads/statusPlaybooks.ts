// Per-status "playbooks": a few lines an admin writes for each custom status ("Site visit booked:
// confirm the day before, send the location pin…"). Every lead AI feature follows the playbook of
// the lead's current status, so the advice matches the team's own process. Stored in platform config
// per workspace (like loss reasons) — no schema change.

export const statusPlaybooksKey = (organizationId: string) => `status_playbooks:${organizationId}`;

export const PLAYBOOK_MAX_CHARS = 1000;

/** Keeps only non-empty entries for real status keys, trimmed and capped. */
export function cleanPlaybooks(input: unknown, validKeys?: readonly string[]): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = validKeys ? new Set(validKeys) : null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (typeof raw !== "string" || (allowed && !allowed.has(key))) continue;
    const text = raw.trim().slice(0, PLAYBOOK_MAX_CHARS);
    if (text) out[key.slice(0, 50)] = text;
  }
  return out;
}
