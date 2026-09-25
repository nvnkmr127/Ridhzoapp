import { db } from "@/db";
import { followUps, leads, meetings } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

// Single source of truth for the denormalized lead.next_follow_up_at column.
// The lead's "next follow-up" is ALWAYS the soonest pending follow-up or scheduled meeting (or null
// when none remain).
// Every path that creates, completes, cancels, deletes, reschedules or snoozes a follow-up MUST
// call this so the lead card, leads list, dashboard, scoring and overdue queries stay in sync with
// the follow_ups table. Before this existed, complete/cancel/delete/status-change left next_follow_up_at
// pointing at a follow-up that was already handled, so leads showed "overdue" forever.
export async function syncLeadFollowUpState(leadId: string): Promise<void> {
  const [next] = await db
    .select({ due: followUps.dueAt })
    .from(followUps)
    .where(and(eq(followUps.leadId, leadId), eq(followUps.status, "pending")))
    .orderBy(asc(followUps.dueAt))
    .limit(1);
  const [meeting] = await db
    .select({ due: meetings.startAt })
    .from(meetings)
    .where(and(eq(meetings.leadId, leadId), eq(meetings.status, "scheduled")))
    .orderBy(asc(meetings.startAt))
    .limit(1);
  const due = [next?.due, meeting?.due].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  await db
    .update(leads)
    .set({ nextFollowUpAt: due, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}

// Record that a lead was actually contacted. Feeds scoring, "going cold"/stale detection, SLA and
// re-engagement cadence — all of which read last_contacted_at, which was previously only ever written
// by the WhatsApp sender.
export async function markLeadContacted(leadId: string, at: Date = new Date()): Promise<void> {
  await db
    .update(leads)
    // Raw SQL doesn't get Drizzle's Date→timestamp mapping, so pass the same ISO string it would
    // (a bare Date is sent as "Thu Sep 24 2026 … GMT+0530", which Postgres rejects).
    .set({ lastContactedAt: at, firstContactedAt: sql`coalesce(${leads.firstContactedAt}, ${at.toISOString()}::timestamp)`, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}

// When a lead changes owner, its pending follow-ups that belonged to the previous owner move with it —
// otherwise the old owner keeps getting reminders for a lead they can no longer open, and the new
// owner is never reminded. Follow-ups deliberately assigned to someone else stay put. Pass a
// transaction to commit it together with the owner change.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function handOverFollowUps(
  leadIds: string[],
  fromOwnerId: string | null,
  toOwnerId: string | null,
  exec: Pick<typeof db, "update"> | Tx = db,
): Promise<number> {
  if (leadIds.length === 0 || !fromOwnerId || fromOwnerId === toOwnerId) return 0;
  const moved = await exec
    .update(followUps)
    .set({ userId: toOwnerId, updatedAt: new Date() })
    .where(and(inArray(followUps.leadId, leadIds), eq(followUps.userId, fromOwnerId), eq(followUps.status, "pending")))
    .returning({ id: followUps.id });
  return moved.length;
}
