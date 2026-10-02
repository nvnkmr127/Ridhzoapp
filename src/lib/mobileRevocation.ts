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

// Token rotation: when the app swaps its token for a fresh one, the OLD one stops working after a short grace
// window (not instantly — if the response carrying the new token is lost, the app must still be able to retry
// with the old one). A stolen token therefore can't be refreshed forever alongside the owner's. The value is
// the epoch-ms at which the token retires ("1" = already revoked, the sign-out case).
export async function retireMobileToken(t: MobileTokenPayload, graceSec = 600) {
  if (!t.jti || !t.exp) return;
  const ttl = t.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await withTimeout(redis.set(key(t.jti), String(Date.now() + graceSec * 1000), "EX", ttl)).catch(() => {});
}

export async function isMobileTokenRevoked(t: MobileTokenPayload) {
  if (!t.jti) return false;
  return withTimeout(redis.get(key(t.jti)))
    .then((v) => v !== null && (v === "1" || Date.now() >= Number(v)))
    .catch(() => false);
}
