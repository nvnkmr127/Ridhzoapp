import { createRedis } from "@/lib/jobs/redis";

// Plain command client (no maxRetriesPerRequest:null) so commands fail fast and checkLimit fails open.
const redis = createRedis();

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
      // Redis unreachable — FAIL OPEN. Rate limiting is a safeguard, not a hard
      // dependency; letting a cache outage block login/webhooks would be worse than
      // briefly not throttling. The connection error is already logged by ioredis.
      // ponytail: fail-open counter; add a fallback in-memory limiter if abuse during
      // Redis outages becomes a real problem.
      console.error("[rate-limit] check failed, allowing request", e);
      return { success: true, limit, remaining: limit, reset: resetTime };
    }
  }
}
