import { describe, it, expect, vi, beforeEach } from "vitest";
import { authorizeApiRequest, clearUserAuthCache } from "./apiAuth";
import { ApiKeyService } from "@/domains/apiKeys/service";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { RateLimiter } from "@/lib/rate-limit";
import { OrgService } from "@/domains/organizations/service";

vi.mock("@/domains/apiKeys/service", () => ({
  ApiKeyService: { verify: vi.fn(), touchLastUsed: vi.fn() },
}));
const maint = vi.hoisted(() => ({ msg: null as string | null }));
vi.mock("@/lib/maintenance", () => ({ maintenanceMessage: async () => maint.msg }));
vi.mock("@/lib/apiQuota", () => ({ withinApiQuota: async () => true, quotaExceededBody: { error: "quota" } }));
vi.mock("@/lib/mobileAuth", () => ({ verifyMobileToken: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: { checkLimit: vi.fn().mockResolvedValue({ success: true, limit: 600, remaining: 599, reset: Date.now() + 60000 }) },
}));
vi.mock("@/domains/organizations/service", () => ({
  OrgService: { isSuspended: vi.fn().mockResolvedValue(false) },
}));
// The Redis L2 mirror fails open (returns undefined) — mirror that deterministically so the
// suite stays hermetic even when a real Redis is reachable on localhost:6379.
vi.mock("@/lib/sessionCache", () => ({
  getMirroredSession: vi.fn().mockResolvedValue(undefined),
  mirrorSession: vi.fn().mockResolvedValue(undefined),
  evictMirroredSession: vi.fn().mockResolvedValue(undefined),
}));
// The live-user lookup only runs on the mobile path; default it to a valid, active, same-org user.
const dbUser = vi.hoisted(() => ({ row: { isActive: true, organizationId: "org-1", roleId: null as string | null } }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: () => [dbUser.row] }) }) }) },
}));
vi.mock("@/db/schema", () => ({ users: {} }));

const ORG = "org-a";

function req(method: string, authorization?: string): any {
  return { method, headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? authorization ?? null : null) } };
}

const verify = ApiKeyService.verify as unknown as ReturnType<typeof vi.fn>;
const touch = ApiKeyService.touchLastUsed as unknown as ReturnType<typeof vi.fn>;
const mobile = verifyMobileToken as unknown as ReturnType<typeof vi.fn>;
const checkLimit = RateLimiter.checkLimit as unknown as ReturnType<typeof vi.fn>;
const isSuspended = OrgService.isSuspended as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  maint.msg = null;
  vi.clearAllMocks();
  clearUserAuthCache();
  mobile.mockReturnValue(null);
  isSuspended.mockResolvedValue(false);
  checkLimit.mockResolvedValue({ success: true, limit: 600, remaining: 599, reset: Date.now() + 60000 });
});

describe("authorizeApiRequest — API keys", () => {
  it("accepts a valid full key and stamps usage", async () => {
    verify.mockResolvedValue({ id: "k1", organizationId: ORG, scope: "full" });
    const auth = await authorizeApiRequest(req("POST", "Bearer pk_valid"));
    expect(auth).toEqual({ organizationId: ORG });
    expect(touch).toHaveBeenCalledWith("k1");
  });

  it("rejects missing / empty / non-bearer / invalid credentials with 401", async () => {
    verify.mockResolvedValue(null);
    for (const h of [undefined, "", "Basic abc", "Bearer pk_bad"]) {
      const auth = (await authorizeApiRequest(req("GET", h))) as { error: Response };
      expect(auth.error.status).toBe(401);
    }
  });

  it("read-only key: allows GET, blocks POST/PATCH/DELETE with 403", async () => {
    verify.mockResolvedValue({ id: "ro", organizationId: ORG, scope: "read_only" });
    const get = await authorizeApiRequest(req("GET", "Bearer pk_ro"));
    expect(get).toEqual({ organizationId: ORG });
    expect(touch).toHaveBeenCalledWith("ro"); // an allowed GET does stamp usage
    touch.mockClear();
    for (const m of ["POST", "PATCH", "DELETE"]) {
      const auth = (await authorizeApiRequest(req(m, "Bearer pk_ro"))) as { error: Response };
      expect(auth.error.status).toBe(403);
    }
    // A blocked write must not be recorded as usage.
    expect(touch).not.toHaveBeenCalled();
  });

  it("blocks a suspended org with 403 and does not stamp usage", async () => {
    verify.mockResolvedValue({ id: "k1", organizationId: ORG, scope: "full" });
    isSuspended.mockResolvedValue(true);
    const auth = (await authorizeApiRequest(req("GET", "Bearer pk_valid"))) as { error: Response };
    expect(auth.error.status).toBe(403);
    expect(touch).not.toHaveBeenCalled();
  });

  it("returns 429 when the key exceeds its rate limit", async () => {
    verify.mockResolvedValue({ id: "k1", organizationId: ORG, scope: "full" });
    checkLimit.mockResolvedValue({ success: false, limit: 600, remaining: 0, reset: Date.now() + 60000 });
    const auth = (await authorizeApiRequest(req("GET", "Bearer pk_valid"))) as { error: Response };
    expect(auth.error.status).toBe(429);
    expect(touch).not.toHaveBeenCalled();
  });
});

describe("authorizeApiRequest — mobile token", () => {
  it("accepts a valid token for an active, same-org user", async () => {
    mobile.mockReturnValue({ sub: "u1", org: "org-1", role: null, email: "a@b.c" });
    const auth = await authorizeApiRequest(req("GET", "Bearer jwt"));
    expect(auth).toEqual({ organizationId: "org-1", userId: "u1", roleId: null });
    // Mobile tokens carry full write access regardless of HTTP method.
    expect(verify).not.toHaveBeenCalled();
  });

  it("uses the user's current role, not the one in the token", async () => {
    mobile.mockReturnValue({ sub: "u1", org: "org-1", role: "admin-role", email: "a@b.c" });
    dbUser.row = { isActive: true, organizationId: "org-1", roleId: "rep-role" };
    const auth = await authorizeApiRequest(req("GET", "Bearer jwt"));
    expect(auth).toEqual({ organizationId: "org-1", userId: "u1", roleId: "rep-role" });
  });

  it("rejects a deactivated user", async () => {
    mobile.mockReturnValue({ sub: "u1", org: "org-1", role: null, email: "a@b.c" });
    dbUser.row = { isActive: false, organizationId: "org-1", roleId: null };
    const auth = (await authorizeApiRequest(req("GET", "Bearer jwt"))) as { error: Response };
    expect(auth.error.status).toBe(401);
    dbUser.row = { isActive: true, organizationId: "org-1", roleId: null };
  });
});

describe("authorizeApiRequest — maintenance mode", () => {
  it("refuses writes with 503 but lets reads through", async () => {
    verify.mockResolvedValue({ id: "k1", organizationId: ORG, scope: "full" });
    maint.msg = "Back soon";
    const write = await authorizeApiRequest(req("POST", "Bearer pk_valid"));
    expect("error" in write && write.error.status).toBe(503);
    expect(await authorizeApiRequest(req("GET", "Bearer pk_valid"))).toEqual({ organizationId: ORG });
  });
});

describe("authorizeApiRequest — key scopes", () => {
  const scoped = (method: string, path: string) => ({ ...req(method, "Bearer pk_valid"), nextUrl: { pathname: path } });
  it("refuses an area the key's scope list doesn't name, allows the ones it does", async () => {
    verify.mockResolvedValue({ id: "k1", organizationId: ORG, scope: "full", scopes: ["leads:write"] });
    const denied = await authorizeApiRequest(scoped("GET", "/api/v1/leads"));
    expect("error" in denied && denied.error.status).toBe(403);
    expect(await authorizeApiRequest(scoped("POST", "/api/v1/leads"))).toEqual({ organizationId: ORG });
    expect(await authorizeApiRequest(scoped("GET", "/api/v1/me"))).toEqual({ organizationId: ORG });
  });
});
