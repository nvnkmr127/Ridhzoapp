import { createRedis } from "@/lib/jobs/redis";

// Monthly /api/v1 request allowance per workspace (plan.apiRequests). Redis INCR per calendar month —
// one cheap command per request, no DB write. Fails OPEN when Redis is down (an outage must not take the
// API with it); the per-minute rate limit still applies.
const redis = createRedis();
const capCache = new Map<string, { max: number; exp: number }>();

async function capFor(organizationId: string): Promise<number> {
  const hit = capCache.get(organizationId);
  if (hit && hit.exp > Date.now()) return hit.max;
  const { PlanService, limitsFor } = await import("@/domains/billing/planService");
  const max = limitsFor(await PlanService.plan(organizationId)).apiRequests;
  capCache.set(organizationId, { max, exp: Date.now() + 5 * 60_000 }); // a plan change applies within 5 min
  return max;
}

/** true = still within the month's allowance. */
export async function withinApiQuota(organizationId: string): Promise<boolean> {
  try {
    const max = await capFor(organizationId);
    if (max === Infinity) return true;
    const period = new Date().toISOString().slice(0, 7);
    const key = `apimonth:${organizationId}:${period}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 40 * 86_400).catch(() => {});
    return n <= max;
  } catch {
    return true;
  }
}

export const quotaExceededBody = { error: "Monthly API request allowance reached for this plan. Upgrade to continue." };
