import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, leads, meetings, sharedLinks, whatsappMessages } from "@/db/schema";

// A cheap "has anything about this lead changed?" token for the live Next Best Action card: one
// indexed query over the lead row plus a count + latest-update per child table. The profile polls
// this and only re-renders the page when it differs — instead of re-running the whole profile's
// ~15 queries on a timer. Everything the NBA and the AI recap read feeds into it. (Not leads.updatedAt: saving the
// AI recap into customData would itself look like a change.)
export async function leadLiveFingerprint(leadId: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({
      phone: leads.phone,
      email: leads.email,
      status: leads.status,
      stageId: leads.stageId,
      score: leads.score,
      lastContactedAt: leads.lastContactedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      acts: sql<string>`(select count(*) || ':' || coalesce(max(${activities.updatedAt})::text, '') from ${activities} where ${activities.leadId} = ${leads.id})`,
      msgs: sql<string>`(select count(*) || ':' || coalesce(max(${whatsappMessages.updatedAt})::text, '') from ${whatsappMessages} where ${whatsappMessages.leadId} = ${leads.id})`,
      mtgs: sql<string>`(select count(*) || ':' || coalesce(max(${meetings.updatedAt})::text, '') from ${meetings} where ${meetings.leadId} = ${leads.id})`,
      views: sql<string>`(select coalesce(sum(${sharedLinks.viewCount}), 0)::text from ${sharedLinks} where ${sharedLinks.leadId} = ${leads.id})`,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  return [
    row.phone ?? "",
    row.email ?? "",
    row.status,
    row.stageId ?? "",
    row.score ?? "",
    row.lastContactedAt?.toISOString() ?? "",
    row.nextFollowUpAt?.toISOString() ?? "",
    row.acts,
    row.msgs,
    row.mtgs,
    row.views,
  ].join("|");
}
