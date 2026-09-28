import { createRedis } from "@/lib/jobs/redis";

// Plain command client (no maxRetriesPerRequest:null) so commands fail fast and checkLimit can fall back.
const redis = createRedis();

let lastWarned = 0;
const local = new Map<string, { count: number; reset: number }>();

function localIncr(key: string, reset: number): number {
  const now = Date.now();
  if (local.size > 10_000) for (const [k, v] of local) if (v.reset <= now) local.delete(k); // drop expired windows
  const hit = local.get(key);
  const next = hit && hit.reset > now ? { count: hit.count + 1, reset: hit.reset } : { count: 1, reset };
  local.set(key, next);
  return next.count;
}

export class RateLimiter {
  static async checkLimit(key: string, limit: number, windowSeconds: number): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const currentWindow = Math.floor(Date.now() / 1000 / windowSeconds);
    const redisKey = `ratelimit:${key}:${currentWindow}`;
    const resetTime = (currentWindow + 1) * windowSeconds * 1000;

    try {
      const limitPromise = (async () => {
        const count = await redis.incr(redisKey);
        if (count === 1) {
          await redis.expire(redisKey, windowSeconds).catch(() => {});
        }
        return count;
      })();

      const timeoutPromise = new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error("Rate limit timeout")), 1000)
      );

      const count = await Promise.race([limitPromise, timeoutPromise]);

      return {
        success: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        reset: resetTime,
      };
    } catch (e) {
      // Redis unreachable: fall back to a per-process counter rather than no limit at all (a cache
      // outage mustn't block logins, but it mustn't switch off brute-force protection either).
      // ponytail: per-instance, so the effective limit is limit × instances during an outage.
      if (Date.now() - lastWarned > 30_000) {
        lastWarned = Date.now();
        console.error("[rate-limit] Redis unavailable, using in-memory limits:", e instanceof Error ? e.message : e);
      }
      const count = localIncr(redisKey, resetTime);
      return { success: count <= limit, limit, remaining: Math.max(0, limit - count), reset: resetTime };
    }
  }
}
