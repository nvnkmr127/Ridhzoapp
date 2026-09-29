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
  mem.set(userId, { data, expiresAtMs: Date.now() + TTL_SECONDS * 1000 });
  if (redisConfigured()) {
    const r = createRedis({ enableOfflineQueue: true });
    try {
      await r.set(redisKey(userId), JSON.stringify(data), "EX", TTL_SECONDS);
    } catch (err) {
      console.warn("[fbPendingStore] Redis set failed, kept in memory fallback:", err);
    } finally {
      try { r.disconnect(); } catch {}
    }
  }
}

/** Reads and deletes the stash (single-use) so tokens don't linger after connection. */
export async function takePendingPages(userId: string): Promise<PendingPages | null> {
  if (redisConfigured()) {
    const r = createRedis({ enableOfflineQueue: true });
    try {
      const raw = await r.get(redisKey(userId));
      if (raw) {
        await r.del(redisKey(userId)).catch(() => {});
        return JSON.parse(raw) as PendingPages;
      }
    } catch (err) {
      console.warn("[fbPendingStore] Redis get failed, falling back to memory:", err);
    } finally {
      try { r.disconnect(); } catch {}
    }
  }
  const hit = mem.get(userId);
  if (!hit) return null;
  mem.delete(userId);
  return hit.expiresAtMs < Date.now() ? null : hit.data;
}

// Same idea for the Lead Intelligence "Connect with Facebook" flow: the user token is held server
// side while the user picks a dataset (Pixel). Read non-destructively so a failed verify can retry.
export type PendingCapi = { userToken: string; expiresAt: string | null; datasets: { pixelId: string; name: string; adAccount: string }[] };
const capiKey = (userId: string) => `fb_pending_capi:${userId}`;
const capiMem = new Map<string, { data: PendingCapi; expiresAtMs: number }>();

export async function setPendingCapi(userId: string, data: PendingCapi): Promise<void> {
  capiMem.set(userId, { data, expiresAtMs: Date.now() + TTL_SECONDS * 1000 });
  if (redisConfigured()) {
    const r = createRedis({ enableOfflineQueue: true });
    try {
      await r.set(capiKey(userId), JSON.stringify(data), "EX", TTL_SECONDS);
    } catch (err) {
      console.warn("[fbPendingStore] Redis set failed, kept in memory fallback:", err);
    } finally {
      try { r.disconnect(); } catch {}
    }
  }
}

export async function getPendingCapi(userId: string): Promise<PendingCapi | null> {
  if (redisConfigured()) {
    const r = createRedis({ enableOfflineQueue: true });
    try {
      const raw = await r.get(capiKey(userId));
      if (raw) return JSON.parse(raw) as PendingCapi;
    } catch (err) {
      console.warn("[fbPendingStore] Redis get failed, falling back to memory:", err);
    } finally {
      try { r.disconnect(); } catch {}
    }
  }
  const hit = capiMem.get(userId);
  return hit && hit.expiresAtMs >= Date.now() ? hit.data : null;
}

export async function clearPendingCapi(userId: string): Promise<void> {
  capiMem.delete(userId);
  if (redisConfigured()) {
    const r = createRedis({ enableOfflineQueue: true });
    try { await r.del(capiKey(userId)); } catch {} finally { try { r.disconnect(); } catch {} }
  }
}
