"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
import { NotificationService } from "@/domains/notifications/service";

const PAGE = 20;

// Newest first, PAGE at a time. cursor: the id of the last one already shown.
export async function listNotificationsAction(opts: { unreadOnly?: boolean; cursor?: string } = {}) {
  const session = await requireAuth();
  const cursor = opts.cursor && z.guid().safeParse(opts.cursor).success ? opts.cursor : undefined;
  const rows = await NotificationService.listForUser(session.user.id, { unreadOnly: opts.unreadOnly, cursor, limit: PAGE });
  return { items: rows, hasMore: rows.length === PAGE };
}

export async function unreadCountAction() {
  const session = await requireAuth();
  return NotificationService.unreadCount(session.user.id);
}

// Marks exactly the notifications the user was shown (never "everything unread", which would also
// clear ones that weren't loaded or arrived meanwhile). No revalidatePath: the bell updates its own
// state, and revalidating "/" made Next re-render the whole current page on every open.
export async function markNotificationsReadAction(ids: string[]) {
  const session = await requireAuth();
  const parsed = z.array(z.guid()).max(200).safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) return;
  await NotificationService.markRead(session.user.id, parsed.data);
}
