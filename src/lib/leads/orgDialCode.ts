import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { dialCodeFor } from "./normalize";

// The workspace's default dial code ("+91"), used to complete national phone numbers on save and
// when building Call/WhatsApp links. Short in-process cache: it only changes when settings change.
const cache = new Map<string, { code: string | null; at: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function orgDialCode(organizationId: string | null | undefined): Promise<string | null> {
  if (!organizationId) return null;
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.code;
  const [org] = await db
    .select({ country: organizations.country, timezone: organizations.timezone, currency: organizations.currency })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const code = org ? dialCodeFor(org) : null;
  cache.set(organizationId, { code, at: Date.now() });
  return code;
}
