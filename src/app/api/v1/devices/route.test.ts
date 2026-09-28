import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const store = new Set<string>();
vi.mock("@/lib/jobs/redis", () => ({
  createRedis: () => ({
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    set: async (k: string) => void store.add(k),
  }),
}));
vi.mock("@/lib/mobileAuth", () => ({ verifyMobileToken: (t: string) => (t === "good" ? { sub: "u1", org: "o1" } : null) }));
const authorize = vi.fn(async () => ({ organizationId: "o1", userId: "u1" }));
vi.mock("@/lib/apiAuth", () => ({ authorizeApiRequest: () => authorize() }));
const register = vi.fn(async () => {});
vi.mock("@/lib/push/mobile", () => ({ MobilePushService: { register: (...a: unknown[]) => register(...a) } }));

const { POST } = await import("./route");
const post = () =>
  POST(new NextRequest("http://x/api/v1/devices", { method: "POST", headers: { authorization: "Bearer good" }, body: JSON.stringify({ token: "fcm1" }) }));

describe("POST /api/v1/devices", () => {
  it("registers once, then answers repeats without auth or DB (no rate-limit spend)", async () => {
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });
});
