import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MobilePushService } from "@/lib/push/mobile";
import { RateLimiter } from "@/lib/rate-limit";
import { createRedis } from "@/lib/jobs/redis";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { createHash } from "node:crypto";

const redis = createRedis();

const schema = z.object({ token: z.string().min(1), platform: z.string().optional() });

// Register this device's push token (Expo or FCM) to the signed-in user.
export async function POST(req: NextRequest) {
  // Older Android builds re-register in a loop (~10/s): the push-token listener fires on every token
  // read. A token this user registered in the last 10 min is already stored — answer at once, without
  // the DB checks or the per-user /api/v1 budget, so the loop can't 429 the rest of the app.
  // ponytail: drop once those builds are gone.
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });
  const mobile = verifyMobileToken((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const seenKey = mobile && `devreg:${mobile.sub}:${createHash("sha256").update(parsed.data.token).digest("hex").slice(0, 32)}`;
  if (seenKey && (await redis.exists(seenKey).catch(() => 0))) return NextResponse.json({ ok: true }, { status: 201 });

  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });

  await MobilePushService.register(auth.userId, auth.organizationId, parsed.data.token, parsed.data.platform);
  if (seenKey) await redis.set(seenKey, "1", "EX", 600).catch(() => {});
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Unregister on sign-out. No bearer needed: the app calls this after its session has already ended
// (expired or revoked), and the push token itself is an unguessable device secret.
export async function DELETE(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!(await RateLimiter.checkLimit(`devices:delete:${ip}`, 30, 60)).success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });

  await MobilePushService.remove(parsed.data.token);
  return NextResponse.json({ ok: true });
}
