import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { PUSH_CHANNELS } from "@/lib/push/channels";

const CHANNELS = Object.values(PUSH_CHANNELS);

// Which mobile push channels this user has muted (leads / reminders / meetings / updates).
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const [u] = await db.select({ off: users.pushOptOut }).from(users).where(eq(users.id, auth.userId)).limit(1);
  return NextResponse.json({ data: { muted: u?.off ?? [] } });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const parsed = z.object({ muted: z.array(z.enum(CHANNELS as [string, ...string[]])).max(CHANNELS.length) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channels" }, { status: 422 });
  const muted = [...new Set(parsed.data.muted)];
  await db.update(users).set({ pushOptOut: muted, updatedAt: new Date() }).where(eq(users.id, auth.userId));
  return NextResponse.json({ data: { muted } });
}
