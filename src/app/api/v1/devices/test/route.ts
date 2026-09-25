import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deviceTokens, users } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { RateLimiter } from "@/lib/rate-limit";

// "Send a test notification" from the app's Settings: pushes to this user's registered devices only
// (nothing is added to the in-app list). Returns how many devices it went to.
export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  if (!(await RateLimiter.checkLimit(`push:test:${auth.userId}`, 5, 60)).success) {
    return NextResponse.json({ error: "Please wait a minute before sending another test." }, { status: 429 });
  }

  const devices = await db.select({ token: deviceTokens.token }).from(deviceTokens).where(eq(deviceTokens.userId, auth.userId));
  if (devices.length === 0) {
    return NextResponse.json({ error: "This phone isn't registered for notifications yet. Allow notifications and try again." }, { status: 409 });
  }
  const [u] = await db.select({ language: users.language }).from(users).where(eq(users.id, auth.userId)).limit(1);
  const [{ t }, { MobilePushService }] = await Promise.all([import("@/lib/i18n"), import("@/lib/push/mobile")]);
  await MobilePushService.sendToUser(auth.userId, {
    title: t(u?.language, "Notifications are on"),
    body: t(u?.language, "You'll get new leads, follow-up reminders and meeting alerts here."),
    data: { type: "test" },
    channelId: "updates",
  });
  return NextResponse.json({ data: { devices: devices.length } });
}
