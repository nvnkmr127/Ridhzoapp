import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { NotificationService } from "@/domains/notifications/service";

// The signed-in user's notifications + unread count.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ data: [], unread: 0 });

  // Next page (newest first, 50 at a time): ?cursor=<id of the last one shown>. Older app builds
  // send ?before=<its createdAt> — still accepted.
  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor") ?? undefined;
  if (cursor && !z.guid().safeParse(cursor).success) return NextResponse.json({ error: "Invalid cursor" }, { status: 422 });
  const beforeRaw = sp.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : undefined;
  if (before && Number.isNaN(before.getTime())) return NextResponse.json({ error: "Invalid before" }, { status: 422 });

  // The unread count belongs to the first page; later pages only need rows.
  const firstPage = !cursor && !before;
  const [rows, unread] = await Promise.all([
    NotificationService.listForUser(auth.userId, { limit: 50, before, cursor }),
    firstPage ? NotificationService.unreadCount(auth.userId) : Promise.resolve(undefined),
  ]);
  return NextResponse.json(firstPage ? { data: rows, unread } : { data: rows });
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
