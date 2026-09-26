import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MobilePushService } from "@/lib/push/mobile";
import { RateLimiter } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(1), platform: z.string().optional() });

// Register this device's push token (Expo or FCM) to the signed-in user.
export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });

  await MobilePushService.register(auth.userId, auth.organizationId, parsed.data.token, parsed.data.platform);
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
