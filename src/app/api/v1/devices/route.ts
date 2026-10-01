import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/clientIp";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MobilePushService } from "@/lib/push/mobile";
import { RateLimiter } from "@/lib/rate-limit";
import { createRedis } from "@/lib/jobs/redis";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { createHash } from "crypto";
import { withTimeout } from "@/lib/sessionCache";

const redis = createRedis();
// Recently-registered marker, keyed by token (so DELETE can clear it), holding the owning user.
const seenKey = (token: string) => `devreg:${createHash("sha256").update(token).digest("hex").slice(0, 32)}`;

const schema = z.object({ token: z.string().min(1), platform: z.string().optional() });

// Register this device's push token (Expo or FCM) to the signed-in user.
export async function POST(req: NextRequest) {
  // App builds before the push.ts fix re-register in a loop (~12/s): reading the token fires the
  // token listener, which read it again. A token this user registered in the last 10 min is already
  // stored — answer at once, without the DB checks or the per-user /api/v1 budget, so the loop can't
  // 429 the rest of the app. Redis is best-effort (500 ms, then the normal path).
  // ponytail: drop once no build older than the push.ts fix is in use.
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });
  const mobile = verifyMobileToken((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const seen = seenKey(parsed.data.token);
  if (mobile && (await withTimeout(redis.get(seen)).catch(() => null)) === mobile.sub) return NextResponse.json({ ok: true }, { status: 201 });

  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });

  await MobilePushService.register(auth.userId, auth.organizationId, parsed.data.token, parsed.data.platform);
  await withTimeout(redis.set(seen, auth.userId, "EX", 600)).catch(() => {});
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Unregister on sign-out. No bearer needed: the app calls this after its session has already ended
// (expired or revoked), and the push token itself is an unguessable device secret.
export async function DELETE(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await RateLimiter.checkLimit(`devices:delete:${ip}`, 30, 60)).success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });

  await MobilePushService.remove(parsed.data.token);
  await withTimeout(redis.del(seenKey(parsed.data.token))).catch(() => {}); // a sign-in right after must register again
  return NextResponse.json({ ok: true });
}
