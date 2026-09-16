import { NextRequest, NextResponse } from "next/server";
import { ApiKeyService } from "@/domains/apiKeys/service";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { RateLimiter } from "@/lib/rate-limit";

export interface ApiAuth {
  organizationId: string;
  userId?: string; // present for mobile-token requests, absent for API-key requests
  roleId?: string | null; // present for mobile-token requests; use hasPermissionForRoleId(roleId, key) to gate a route
}

// Per-principal request budget for /api/v1. Generous enough for real integrations (Zapier, custom
// backends), low enough to blunt runaway loops / abuse of expensive endpoints. Fails open if Redis
// is down (see RateLimiter), so a cache outage never blocks legitimate traffic.
const RATE_LIMIT = 600; // requests
const RATE_WINDOW = 60; // seconds

// Shared bearer auth for every /api/v1 route: a mobile-app JWT (carries userId) or a public API key.
// Returns the tenant scope, or a ready-to-return error response.
export async function authorizeApiRequest(req: NextRequest): Promise<ApiAuth | { error: NextResponse }> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : "";

  const mobile = verifyMobileToken(raw);
  if (mobile) {
    // A 30-day token outlives membership changes, so re-check the user is still active and still in
    // the token's org on every request — a removed/deactivated user is locked out immediately.
    if (!(await userStillValid(mobile.sub, mobile.org))) {
      return { error: NextResponse.json({ error: "Invalid or missing credentials" }, { status: 401 }) };
    }
    if (await suspended(mobile.org)) return { error: suspendedResponse() };
    const limited = await rateLimited(`mobile:${mobile.sub}`);
    if (limited) return { error: limited };
    return { organizationId: mobile.org, userId: mobile.sub, roleId: mobile.role };
  }

  const key = await ApiKeyService.verify(raw);
  if (key) {
    if (await suspended(key.organizationId)) return { error: suspendedResponse() };
    // Read-only keys may only issue safe (GET/HEAD) requests.
    if (key.scope === "read_only" && !isSafeMethod(req.method)) {
      return { error: NextResponse.json({ error: "This API key is read-only." }, { status: 403 }) };
    }
    const limited = await rateLimited(`apikey:${key.id}`);
    if (limited) return { error: limited };
    ApiKeyService.touchLastUsed(key.id); // best-effort, only once the request is actually allowed
    return { organizationId: key.organizationId };
  }

  return { error: NextResponse.json({ error: "Invalid or missing credentials" }, { status: 401 }) };
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

async function rateLimited(principal: string): Promise<NextResponse | null> {
  const r = await RateLimiter.checkLimit(`apiv1:${principal}`, RATE_LIMIT, RATE_WINDOW);
  if (r.success) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": r.limit.toString(),
        "X-RateLimit-Remaining": r.remaining.toString(),
        "X-RateLimit-Reset": r.reset.toString(),
        "Retry-After": Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)).toString(),
      },
    },
  );
}

async function userStillValid(userId: string, organizationId: string): Promise<boolean> {
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [u] = await db
    .select({ isActive: users.isActive, organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!u && u.isActive !== false && u.organizationId === organizationId;
}

async function suspended(organizationId: string): Promise<boolean> {
  const { OrgService } = await import("@/domains/organizations/service");
  return OrgService.isSuspended(organizationId);
}

function suspendedResponse() {
  return NextResponse.json({ error: "This workspace has been suspended. Contact support." }, { status: 403 });
}
