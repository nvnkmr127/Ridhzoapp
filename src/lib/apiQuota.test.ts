import { describe, it, expect, vi, beforeEach } from "vitest";

// Monthly API allowance for API keys: counts per org per month, fails open when Redis is down.
const incr = vi.fn();
const plan = vi.hoisted(() => ({ max: 3 }));
vi.mock("@/lib/jobs/redis", () => ({ createRedis: () => ({ incr: (...a: unknown[]) => incr(...a), expire: async () => 1 }) }));
vi.mock("@/domains/billing/planService", () => ({ PlanService: { plan: async () => "free" }, limitsFor: () => ({ apiRequests: plan.max }) }));

import { withinApiQuota } from "./apiQuota";

describe("withinApiQuota", () => {
  beforeEach(() => { incr.mockReset(); plan.max = 3; });
  it("allows up to the cap, then refuses", async () => {
    for (const n of [1, 2, 3]) { incr.mockResolvedValueOnce(n); expect(await withinApiQuota("org-q1")).toBe(true); }
    incr.mockResolvedValueOnce(4);
    expect(await withinApiQuota("org-q1")).toBe(false);
  });
  it("fails open if Redis errors", async () => {
    incr.mockRejectedValueOnce(new Error("down"));
    expect(await withinApiQuota("org-q2")).toBe(true);
  });
  it("skips counting for unmetered plans", async () => {
    plan.max = Infinity;
    expect(await withinApiQuota("org-q3")).toBe(true);
    expect(incr).not.toHaveBeenCalled();
  });
});
