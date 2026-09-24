"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { DedupService } from "@/domains/leads/dedupService";
import { LeadService } from "@/domains/leads/service";
import { AuditService } from "@/domains/audit/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function findDuplicatesAction() {
  const { organizationId } = await requireOrg();
  return DedupService.findDuplicateGroups(organizationId);
}

export async function setAutoMergeAction(enabled: boolean) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  try {
    const { OrgService } = await import("@/domains/organizations/service");
    await OrgService.updateOrganization(organizationId, { autoMergeDuplicates: enabled ? 1 : 0 });
    // Distinct action name from the general settings form save — sharing "org.settings_update"
    // would make the two indistinguishable in the trail despite carrying unrelated metadata shapes.
    await AuditService.log({ organizationId, userId, action: "org.auto_merge_toggle", entityType: "organization", entityId: organizationId, metadata: { autoMergeDuplicates: enabled } });
    revalidatePath("/leads/duplicates");
    return ok({ enabled });
  } catch (e) {
    return actionFail(e);
  }
}

const mergeSchema = z.object({ primaryId: z.guid(), duplicateId: z.guid() });

export async function mergeLeadsAction(input: z.infer<typeof mergeSchema>) {
  const { organizationId, userId } = await requirePermission("leads.merge");
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Select a primary and a duplicate lead to merge.");
  const { primaryId, duplicateId } = parsed.data;
  try {
    // Snapshot the duplicate's identity before merge() hard-deletes it — otherwise the audit
    // entry's only reference to the merged lead is an id that resolves to nothing afterwards.
    const duplicate = await LeadService.getLead(duplicateId, organizationId);
    await DedupService.merge(organizationId, primaryId, duplicateId);
    await AuditService.log({
      organizationId,
      userId,
      action: "lead.merge",
      entityType: "lead",
      entityId: primaryId,
      metadata: { mergedLead: duplicate ? { id: duplicate.id, name: duplicate.name, email: duplicate.email, phone: duplicate.phone } : { id: duplicateId } },
    });
    revalidatePath("/leads");
    revalidatePath("/leads/duplicates");
    return ok({ merged: true });
  } catch (e) {
    return actionFail(e);
  }
}
