import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { assertWritable, hasPermission } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { db } from "@/db";
import { leads } from "@/db/schema";

// Lead-level access rule, the same one the lead profile page uses to decide who can open a lead:
// same tenant, and — for anyone without settings.manage (admins) — assigned to them. Every action
// that reads or changes ONE lead must pass through here; the list views already filter this way, so
// without it a rep could still act on a colleague's lead by id (reassign, change status, add notes…).

async function canSeeAllLeads() {
  return hasPermission("settings.manage");
}

// The lead the current user may ACT on, or null. Null = "not found" to the caller, so we never reveal
// that someone else's lead exists.
export async function getActionableLead(leadId: string) {
  const { userId, organizationId } = await assertWritable();
  const lead = await LeadService.getLead(leadId, organizationId);
  if (!lead) return null;
  if (lead.ownerId !== userId && !(await canSeeAllLeads())) return null;
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
  if (row.ownerId !== ctx.userId && !(await canSeeAllLeads())) throw new Error("Lead not found");
}

// For bulk actions: keep only the ids the user may act on (silently drops the rest).
export async function filterAccessibleLeadIds(leadIds: string[], ctx: { userId: string; organizationId: string }) {
  if (leadIds.length === 0) return [];
  const rows = await db
    .select({ id: leads.id, ownerId: leads.ownerId })
    .from(leads)
    .where(and(inArray(leads.id, leadIds), eq(leads.organizationId, ctx.organizationId)));
  if (await canSeeAllLeads()) return rows.map((r) => r.id);
  return rows.filter((r) => r.ownerId === ctx.userId).map((r) => r.id);
}
