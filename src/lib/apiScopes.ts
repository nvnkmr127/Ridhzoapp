// Fine-grained scopes for API keys, on top of the full / read-only switch. A key with NO scope list (null)
// behaves as before. With a list, each /api/v1 area is allowed only if the key names it — least privilege for
// integrations that only need, say, to push leads in.
export const API_SCOPES = [
  { key: "leads:read", label: "Read leads" },
  { key: "leads:write", label: "Create & edit leads" },
  { key: "meetings:read", label: "Read meetings" },
  { key: "meetings:write", label: "Create & edit meetings" },
  { key: "followups:read", label: "Read follow-ups" },
  { key: "followups:write", label: "Create & edit follow-ups" },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["key"];
export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key) as readonly string[];

const AREA: Record<string, string> = { leads: "leads", meetings: "meetings", "follow-ups": "followups" };

/** The scope an /api/v1 request needs, or null for areas no scope guards (me, statuses, templates, …). */
export function requiredScope(pathname: string, method: string): string | null {
  const area = AREA[pathname.replace(/^\/api\/v1\//, "").split("/")[0]];
  if (!area) return null;
  return `${area}:${method === "GET" || method === "HEAD" ? "read" : "write"}`;
}
