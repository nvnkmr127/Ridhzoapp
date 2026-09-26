import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, leads } from "@/db/schema";

// One definition of "attempt" and "answered" for every call report (leaderboard, sources, morning
// email). Read from what recordLeadContact writes: outgoing calls start "Called — ", and a call
// connected if the phone logged talk time or the rep picked "Answered". Wrong numbers stay in the
// attempts on purpose — a source full of them should show a low answer rate.
export const outgoingCall = sql`(${activities.type} = 'call' and ${activities.content} like 'Called — %')`;
export const answeredCall = sql`(coalesce(${activities.durationSec}, 0) > 0 or ${activities.content} like 'Called — Answered%')`;

export const callCounts = {
  attempts: sql<number>`count(*) filter (where ${outgoingCall})`.mapWith(Number),
  answered: sql<number>`count(*) filter (where ${outgoingCall} and ${answeredCall})`.mapWith(Number),
};

// null when there's nothing to rate (no attempts), so the UI shows "—" rather than a fake 0%.
export const answerRate = (answered: number, attempts: number) => (attempts ? Math.round((answered / attempts) * 100) : null);

// Answer rate on outgoing calls per lead source — which sources bring reachable numbers.
export async function answerRateBySource(organizationId: string, since?: Date) {
  const rows = await db
    .select({ sourceId: leads.sourceId, total: count(), ...callCounts })
    .from(activities)
    .innerJoin(leads, eq(activities.leadId, leads.id))
    .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), eq(activities.type, "call"), since ? gte(activities.occurredAt, since) : undefined))
    .groupBy(leads.sourceId);
  return new Map(rows.map((r) => [r.sourceId, answerRate(r.answered, r.attempts)]));
}
