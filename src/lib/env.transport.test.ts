import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("validateEnv transport warnings (production)", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXTAUTH_SECRET", "s"); vi.stubEnv("EMAIL_SECRET_KEY", "k"); });
  afterEach(() => vi.unstubAllEnvs());

  async function run(db: string, redis: string) {
    vi.restoreAllMocks(); vi.resetModules(); vi.stubEnv("DATABASE_URL", db); vi.stubEnv("REDIS_URL", redis);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    (await import("./env")).validateEnv();
    return err.mock.calls.map((c) => String(c[0]));
  }

  it("flags a remote plaintext database and queue", async () => {
    const msgs = await run("postgres://u:p@metro.proxy.rlwy.net:1/db?sslmode=disable", "redis://:p@caboose.proxy.rlwy.net:2");
    expect(msgs.some((m) => m.includes("DATABASE_URL"))).toBe(true);
    expect(msgs.some((m) => m.includes("REDIS_URL"))).toBe(true);
  });

  it("is quiet for private/internal and TLS endpoints", async () => {
    expect(await run("postgres://u:p@db.railway.internal:5432/db", "rediss://:p@redis.example.com:6379")).toEqual([]);
    expect(await run("postgres://u:p@postgres:5432/db?sslmode=disable", "redis://:p@redis:6379")).toEqual([]);
  });
});
