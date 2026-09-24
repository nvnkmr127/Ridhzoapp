// The lead list the user last looked at (ids in on-screen order + the URL with its filters), so the
// lead profile can offer "back to your list" and previous/next without losing search, filters or page.
// Per-tab (sessionStorage); every access is guarded because storage can be unavailable.
const KEY = "ridhzo_lead_list";

export type LeadListContext = { ids: string[]; url: string };

export function saveLeadListContext(ctx: LeadListContext) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    /* storage unavailable */
  }
}

export function readLeadListContext(): LeadListContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const ctx = raw ? (JSON.parse(raw) as LeadListContext) : null;
    return ctx && Array.isArray(ctx.ids) && typeof ctx.url === "string" ? ctx : null;
  } catch {
    return null;
  }
}
