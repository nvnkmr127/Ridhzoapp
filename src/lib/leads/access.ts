import "server-only";
import { and, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { assertWritable, hasPermission } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { db } from "@/db";
import { followUps, leads, meetings } from "@/db/schema";

// Lead-level access rule, the same one the lead profile page uses to decide who can open a lead:
// same tenant, and — for anyone without settings.manage (admins) — assigned to them. Every action
// that reads or changes ONE lead must pass through here; the list views already filter this way, so
// without it a rep could still act on a colleague's lead by id (reassign, change status, add notes…).

async function canSeeAllLeads() {
  return hasPermission("settings.manage");
}

// Besides its owner (and admins), a lead can be opened and worked by anyone doing work on it: assigned
// to attend a meeting with it (e.g. a site engineer), or assigned one of its follow-ups (the Follow-ups
// list and follow-up notifications link them to it). ONE rule for the profile page, every action, bulk
// filters, search and the mobile API — so nothing lists a lead its viewer then can't open. Deleting a
// lead stays with its owner/admins (checked separately in deleteLeadAction).
export function worksOnLeadSql(userId: string): SQL {
  return or(
    exists(db.select({ one: sql`1` }).from(meetings).where(and(eq(meetings.leadId, leads.id), or(eq(meetings.assigneeId, userId), sql`${meetings.coAttendeeIds} @> ARRAY[${userId}]::uuid[]`)))),
    exists(db.select({ one: sql`1` }).from(followUps).where(and(eq(followUps.leadId, leads.id), eq(followUps.userId, userId)))),
  )!;
}

/** SQL: leads this (non-admin) user may open. */
export function visibleToUserSql(userId: string): SQL {
  return or(eq(leads.ownerId, userId), worksOnLeadSql(userId))!;
}

export async function worksOnLead(leadId: string, userId: string) {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), worksOnLeadSql(userId)))
    .limit(1);
  return !!row;
}

// The lead the current user may ACT on, or null. Null = "not found" to the caller, so we never reveal
// that someone else's lead exists.
export async function getActionableLead(leadId: string) {
  const { userId, organizationId } = await assertWritable();
  const lead = await LeadService.getLead(leadId, organizationId);
  if (!lead) return null;
  if (lead.ownerId !== userId && !(await canSeeAllLeads()) && !(await worksOnLead(leadId, userId))) return null;
  return { lead, userId, organizationId };
}

// Throws "Lead not found" (→ NOT_FOUND via actionFail) unless the user may act on this lead.
export async function assertLeadAccess(leadId: string, ctx: { userId: string; organizationId: string }) {
  const [row] = await db
    .select({ ownerId: leads.ownerId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, ctx.organizationId)))
    .limit(1);
  if (!row) throw new Error("Lead not found");
  if (row.ownerId !== ctx.userId && !(await canSeeAllLeads()) && !(await worksOnLead(leadId, ctx.userId))) {
    throw new Error("Lead not found");
  }
}

// For bulk actions: keep only the ids the user may act on (silently drops the rest).
export async function filterAccessibleLeadIds(leadIds: string[], ctx: { userId: string; organizationId: string }) {
  if (leadIds.length === 0) return [];
  const all = await canSeeAllLeads();
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(inArray(leads.id, leadIds), eq(leads.organizationId, ctx.organizationId), all ? undefined : visibleToUserSql(ctx.userId)));
  return rows.map((r) => r.id);
}
