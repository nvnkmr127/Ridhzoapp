import { createRedis, redisConfigured } from "@/lib/jobs/redis";

// Short-lived stash for Pages discovered during Facebook OAuth, keyed by the user completing the
// flow. Page access tokens are held HERE (server side) between the OAuth callback and the user's
// page selection, instead of being posted to the browser and sent back — the client only ever sees
// pageId + name. In prod this lives in Redis (Upstash); local dev with no REDIS_URL falls back to an
// in-process map, which is fine because dev serves both requests from one Node process.
// ponytail: per-user key, 10-min TTL; a stale/expired stash just asks the user to reconnect.

export type PendingPage = { pageId: string; name: string; pageAccessToken: string };
export interface PendingPages {
  pages: PendingPage[];
  expiresAt: string | null;
}

const TTL_SECONDS = 600;
const redisKey = (userId: string) => `fb_pending_pages:${userId}`;
const mem = new Map<string, { data: PendingPages; expiresAtMs: number }>();

export async function setPendingPages(userId: string, data: PendingPages): Promise<void> {
  if (redisConfigured()) {
    const r = createRedis();
    try {
      await r.set(redisKey(userId), JSON.stringify(data), "EX", TTL_SECONDS);
    } finally {
      r.quit();
    }
    return;
  }
  mem.set(userId, { data, expiresAtMs: Date.now() + TTL_SECONDS * 1000 });
}

/** Reads and deletes the stash (single-use) so tokens don't linger after connection. */
export async function takePendingPages(userId: string): Promise<PendingPages | null> {
  if (redisConfigured()) {
    const r = createRedis();
    try {
      const raw = await r.get(redisKey(userId));
      if (raw) await r.del(redisKey(userId));
      return raw ? (JSON.parse(raw) as PendingPages) : null;
    } finally {
      r.quit();
    }
  }
  const hit = mem.get(userId);
  if (!hit) return null;
  mem.delete(userId);
  return hit.expiresAtMs < Date.now() ? null : hit.data;
}
