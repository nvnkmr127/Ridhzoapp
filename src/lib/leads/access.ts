import "server-only";
import { assertWritable, hasPermission } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";

// The lead the current user may ACT on: same tenant, and (for non-admins) assigned to them — the same
// rule the lead profile page uses to decide who can open it. Returns null when not allowed, so
// actions can answer "not found" without revealing that someone else's lead exists.
export async function getActionableLead(leadId: string) {
  const { userId, organizationId } = await assertWritable();
  const lead = await LeadService.getLead(leadId, organizationId);
  if (!lead) return null;
  if (lead.ownerId !== userId && !(await hasPermission("settings.manage"))) return null;
  return { lead, userId, organizationId };
}
