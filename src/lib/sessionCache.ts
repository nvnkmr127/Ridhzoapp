import { createRedis } from "@/lib/jobs/redis";

// L2 session cache in Redis: mirrors mobile user authorization across multiple app instances
// so horizontal containers/serverless nodes share validated sessions without hitting Postgres.
// Fails open: a Redis timeout or disconnect falls back to Postgres.
const redis = createRedis();
const key = (userId: string, orgId: string) => `session:v1:${userId}:${orgId}`;
const TTL_SEC = 120; // 2 minutes: short enough for quick demotion/revocation, long enough to absorb traffic bursts

export const withTimeout = <T>(p: Promise<T>, ms = 500): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), ms))]);

export async function getMirroredSession(userId: string, orgId: string): Promise<{ roleId: string | null } | null | undefined> {
  try {
    const raw = await withTimeout(redis.get(key(userId, orgId)));
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined; // on timeout/disconnect, fall through to DB
  }
}

export async function mirrorSession(userId: string, orgId: string, data: { roleId: string | null } | null): Promise<void> {
  try {
    await withTimeout(redis.set(key(userId, orgId), JSON.stringify(data), "EX", TTL_SEC)).catch(() => {});
  } catch {}
}

export async function evictMirroredSession(userId: string, orgId?: string): Promise<void> {
  try {
    if (orgId) {
      await withTimeout(redis.del(key(userId, orgId))).catch(() => {});
    } else {
      const keys = await withTimeout(redis.keys(`session:v1:${userId}:*`)).catch(() => []);
      if (keys?.length) await withTimeout(redis.del(...keys)).catch(() => {});
    }
  } catch {}
}
