import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { mobileSession } from "@/lib/mobileAuth";
import { RateLimiter } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Native login: verify credentials (same bcrypt store as NextAuth) and return a bearer token.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limit = await RateLimiter.checkLimit(`auth:login:${ip}`, 10, 60);
  // Per-account guard too (shared with the web login), so rotating IPs can't brute-force one user.
  const peek = await req.clone().json().catch(() => null);
  const emailKey = typeof peek?.email === "string" ? peek.email.trim().toLowerCase() : "";
  if (limit.success && emailKey && !(await RateLimiter.checkLimit(`auth:login:email:${emailKey}`, 8, 15 * 60)).success) {
    return NextResponse.json({ error: "Too many login attempts for this account. Please wait 15 minutes." }, { status: 429 });
  }
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait a minute before trying again." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.limit.toString(),
          "X-RateLimit-Remaining": limit.remaining.toString(),
          "X-RateLimit-Reset": limit.reset.toString(),
        },
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password format" }, { status: 422 });
  }

  const [user] = await db.select().from(users).where(and(eq(users.email, parsed.data.email.trim().toLowerCase()), isNull(users.deletedAt))).limit(1);
  // Same generic error whether the email is unknown or the password is wrong — don't leak which.
  if (!user || !user.isActive || !user.organizationId) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const { OrgService } = await import("@/domains/organizations/service");
  if (await OrgService.isSuspended(user.organizationId)) {
    return NextResponse.json({ error: "This workspace has been suspended. Contact support." }, { status: 403 });
  }

  return NextResponse.json(mobileSession({ ...user, organizationId: user.organizationId }));
}
