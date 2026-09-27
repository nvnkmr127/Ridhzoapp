import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { NotificationService } from "@/domains/notifications/service";

// The signed-in user's notifications + unread count.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ data: [], unread: 0 });

  // ?before=<createdAt of the last one shown> for the next page (newest first, 50 at a time).
  const beforeRaw = req.nextUrl.searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : undefined;
  if (before && Number.isNaN(before.getTime())) return NextResponse.json({ error: "Invalid before" }, { status: 422 });

  const [rows, unread] = await Promise.all([
    NotificationService.listForUser(auth.userId, { limit: 50, before }),
    NotificationService.unreadCount(auth.userId),
  ]);
  return NextResponse.json({ data: rows, unread });
}

const schema = z.object({ ids: z.array(z.guid()).optional() });

// Mark notifications read (specific ids, or all of the user's when omitted).
export async function PATCH(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });

  await NotificationService.markRead(auth.userId, parsed.data.ids);
  return NextResponse.json({ ok: true });
}
