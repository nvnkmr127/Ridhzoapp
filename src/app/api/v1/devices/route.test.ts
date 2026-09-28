import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const store = new Map<string, string>();
vi.mock("@/lib/jobs/redis", () => ({
  createRedis: () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
    del: async (k: string) => void store.delete(k),
  }),
}));
vi.mock("@/lib/rate-limit", () => ({ RateLimiter: { checkLimit: async () => ({ success: true }) } }));
vi.mock("@/lib/mobileAuth", () => ({ verifyMobileToken: (t: string) => (t ? { sub: t, org: "o1" } : null) }));
const authorize = vi.fn(async (req: NextRequest) => ({ organizationId: "o1", userId: req.headers.get("authorization")!.slice(7) }));
vi.mock("@/lib/apiAuth", () => ({ authorizeApiRequest: (req: NextRequest) => authorize(req) }));
const register = vi.fn(async (..._a: unknown[]) => {});
const remove = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/push/mobile", () => ({ MobilePushService: { register: (...a: unknown[]) => register(...a), remove: (...a: unknown[]) => remove(...a) } }));

const { POST, DELETE } = await import("./route");
const req = (method: string, user?: string) =>
  new NextRequest("http://x/api/v1/devices", { method, headers: user ? { authorization: `Bearer ${user}` } : {}, body: JSON.stringify({ token: "fcm1" }) });

describe("POST /api/v1/devices", () => {
  beforeEach(() => {
    store.clear();
    authorize.mockClear();
    register.mockClear();
  });

  it("registers once, then answers repeats without auth or DB (no rate-limit spend)", async () => {
    for (let i = 0; i < 3; i++) expect((await POST(req("POST", "u1"))).status).toBe(201);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("re-registers after sign-out, and when the device changes hands", async () => {
    await POST(req("POST", "u1"));
    await DELETE(req("DELETE"));
    await POST(req("POST", "u1"));
    await POST(req("POST", "u2"));
    expect(register).toHaveBeenCalledTimes(3);
  });
});
