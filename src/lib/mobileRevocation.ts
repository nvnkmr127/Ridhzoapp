import { createRedis } from "@/lib/jobs/redis";
import type { MobileTokenPayload } from "@/lib/mobileAuth";

// Revoked mobile tokens (signed out on the phone), kept in Redis until they'd have expired anyway.
// Fails open like the rate limiter: a Redis outage must not sign everyone out.
const redis = createRedis();
const key = (jti: string) => `mobile:revoked:${jti}`;

const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), 1000))]);

export async function revokeMobileToken(t: MobileTokenPayload) {
  if (!t.jti || !t.exp) return;
  const ttl = t.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await withTimeout(redis.set(key(t.jti), "1", "EX", ttl)).catch(() => {});
}

export async function isMobileTokenRevoked(t: MobileTokenPayload) {
  if (!t.jti) return false;
  return withTimeout(redis.exists(key(t.jti)))
    .then((n) => n === 1)
    .catch(() => false);
}
