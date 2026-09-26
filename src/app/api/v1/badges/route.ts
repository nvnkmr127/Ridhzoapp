import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { followUps, leads, meetings } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canSeeAllLeads } from "@/lib/meetingsApi";
import { NotificationService } from "@/domains/notifications/service";
import { startOfZonedDay } from "@/lib/tz";

// Tab-bar counts, each with the same scope as the screen it sits on, so a badge always equals what
// the tab shows: follow-ups due by end of today (incl. overdue), meetings today or still waiting for
// an outcome (last 30 days), unread notifications.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ data: { followUps: 0, meetings: 0, notifications: 0 } });
  const userId = auth.userId;

  const { getOrgFormat } = await import("@/lib/format.server");
  const { timezone } = await getOrgFormat(auth.organizationId).catch(() => ({ timezone: "UTC" }));
  const endOfToday = startOfZonedDay(new Date(), timezone, 1);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const all = await canSeeAllLeads(auth);

  const [[fu], [mt], unread] = await Promise.all([
    // Same scope as GET /api/v1/follow-ups.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(followUps)
      .innerJoin(leads, eq(followUps.leadId, leads.id))
      .where(
        and(
          eq(leads.organizationId, auth.organizationId),
          or(eq(followUps.userId, userId), eq(leads.ownerId, userId)),
          isNull(leads.deletedAt),
          eq(followUps.status, "pending"),
          lt(followUps.dueAt, endOfToday),
        ),
      ),
    // Same scope as GET /api/v1/meetings (MeetingService.list).
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(meetings)
      .innerJoin(leads, eq(meetings.leadId, leads.id))
      .where(
        and(
          eq(meetings.organizationId, auth.organizationId),
          isNull(leads.deletedAt),
          eq(meetings.status, "scheduled"),
          gte(meetings.startAt, monthAgo),
          lt(meetings.startAt, endOfToday),
          all ? undefined : or(eq(meetings.assigneeId, userId), eq(meetings.organizerId, userId), eq(leads.ownerId, userId)),
        ),
      ),
    NotificationService.unreadCount(userId),
  ]);

  return NextResponse.json({ data: { followUps: fu?.n ?? 0, meetings: mt?.n ?? 0, notifications: unread } });
}
