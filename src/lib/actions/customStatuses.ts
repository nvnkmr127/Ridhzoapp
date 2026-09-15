"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { CustomStatusSchemaService, StatusCategory } from "@/domains/leads/customStatusSchemaService";
import { LeadStatusService } from "@/domains/leads/leadStatusService";
import { LeadService } from "@/domains/leads/service";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const addStatusSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  color: z.string().min(1).max(50),
  category: z.enum(["open", "in_progress", "won", "lost", "unqualified"]),
  orderIndex: z.number().optional(),
});

export async function getTenantStatusSchemaAction() {
  const { organizationId } = await requireOrg();
  return CustomStatusSchemaService.getTenantStatusSchema(organizationId);
}

export async function addOrUpdateStatusAction(input: {
  key: string;
  label: string;
  color: string;
  category: StatusCategory;
  orderIndex?: number;
}) {
  // Editing the org's status taxonomy reshapes every user's pipeline, analytics and won/lost
  // bookkeeping — same trust level as general settings, not a plain member action.
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = addStatusSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please provide a key, label, color, and category for the status.", zodFieldErrors(parsed.error));
  }

  try {
    const result = await CustomStatusSchemaService.addOrUpdateStatus(organizationId, parsed.data);
    revalidatePath("/leads");
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteCustomStatusAction(statusKey: string) {
  const { organizationId } = await requirePermission("settings.manage");
  if (!statusKey) return fail("VALIDATION", "No status was specified.");

  try {
    const success = await CustomStatusSchemaService.deleteCustomStatus(organizationId, statusKey);
    revalidatePath("/leads");
    return ok({ success });
  } catch (e) {
    return actionFail(e);
  }
}

export async function bulkUpdateLeadStatusAction(leadIds: string[], newStatus: string) {
  // Bulk-mutating lead statuses is a lead edit — gate it like every other status change
  // (the sibling bulkChangeLeadStatusAction did; this path had slipped through with requireOrg).
  const { userId, organizationId } = await requirePermission("leads.edit");
  if (!leadIds || leadIds.length === 0) throw new Error("No lead IDs provided");

  // Route through the single canonical status engine so won/lost bookkeeping (won_at, loss reason,
  // follow-up cancellation) and custom-status categories apply — same path as single/bulk edits.
  let updated = 0;
  const updatedIds: string[] = [];
  for (const id of leadIds) {
    try {
      const lead = await LeadService.changeStatus(id, newStatus, userId, organizationId);
      if (lead) { updated++; updatedIds.push(id); }
    } catch { /* skip a lead that no longer exists / can't transition */ }
  }
  revalidatePath("/leads");
  return { updatedCount: updated, leadIds: updatedIds };
}

export async function getLeadStatusHistoryAction(leadId: string) {
  const { organizationId } = await requireOrg();
  if (!leadId) throw new Error("Lead ID required");
  return LeadStatusService.getStatusHistory(leadId, organizationId);
}

export async function getStatusDurationAnalyticsAction() {
  const { organizationId } = await requireOrg();
  return LeadStatusService.getStatusDurationAnalytics(organizationId);
}
