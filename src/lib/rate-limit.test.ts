import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/jobs/redis", () => ({
  createRedis: () => ({ incr: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")), expire: vi.fn() }),
}));
vi.spyOn(console, "error").mockImplementation(() => {});

import { RateLimiter } from "./rate-limit";

describe("RateLimiter without Redis", () => {
  it("still enforces the limit with the in-memory fallback", async () => {
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await RateLimiter.checkLimit("auth:login:email:a@b.co", 2, 60)).success);
    expect(results).toEqual([true, true, false]);
    expect((await RateLimiter.checkLimit("auth:login:email:other@b.co", 2, 60)).success).toBe(true); // per key
  });
});
