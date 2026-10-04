// The one thing both the server that writes the cached recap and the browser that reads it need to
// agree on: how long a recap stays fresh.
//
// This lives on its own because the obvious home — leadAssist.ts — is `server-only`. The lead page's
// recap panel is a client component and has to decide for itself whether what it's showing is out of
// date, and importing the constant from leadAssist drags `next/cache`, `next/server` and the db into
// the client bundle. A TTL is not worth that; it is a number both sides can agree on with no imports.

/** A recap older than this was written against a lead that has since moved. */
export const RECAP_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

/** True when a recap saved at `at` (ISO) is old enough that its advice shouldn't be trusted. */
export function recapIsStale(at: string | null | undefined, now: number = Date.now()): boolean {
  if (!at) return true;
  const saved = Date.parse(at);
  if (!Number.isFinite(saved)) return true;
  return now - saved >= RECAP_TTL_MS;
}