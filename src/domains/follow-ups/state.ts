import { db } from "@/db";
import { followUps, leads } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

// Single source of truth for the denormalized lead.next_follow_up_at column.
// The lead's "next follow-up" is ALWAYS the soonest pending follow-up (or null when none remain).
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

  await db
    .update(leads)
    .set({ nextFollowUpAt: next?.due ?? null, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}

// Record that a lead was actually contacted. Feeds scoring, "going cold"/stale detection, SLA and
// re-engagement cadence — all of which read last_contacted_at, which was previously only ever written
// by the WhatsApp sender.
export async function markLeadContacted(leadId: string, at: Date = new Date()): Promise<void> {
  await db
    .update(leads)
    .set({ lastContactedAt: at, firstContactedAt: sql`coalesce(${leads.firstContactedAt}, ${at})`, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}
