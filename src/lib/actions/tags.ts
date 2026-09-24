"use server";

import { assertLeadAccess, filterAccessibleLeadIds } from "@/lib/leads/access";

import { requireOrg, assertWritable } from "@/lib/rbac";
import { TagService } from "@/domains/tags/service";
import { revalidatePath } from "next/cache";

export async function listTagsAction() {
  const { organizationId } = await requireOrg();
  return TagService.listAll(organizationId);
}

export async function addTagAction(leadId: string, name: string) {
  const { userId, organizationId } = await assertWritable();
  await assertLeadAccess(leadId, { userId, organizationId });
  const tag = await TagService.addToLead(leadId, name, organizationId);
  revalidatePath(`/leads/${leadId}`);
  return tag;
}

export async function removeTagAction(leadId: string, tagId: string) {
  const { userId, organizationId } = await assertWritable();
  await assertLeadAccess(leadId, { userId, organizationId });
  await TagService.removeFromLead(leadId, tagId, organizationId);
  revalidatePath(`/leads/${leadId}`);
}

export async function bulkAddTagAction(leadIds: string[], tagName: string) {
  const { userId, organizationId } = await assertWritable();
  const tag = await TagService.bulkAddToLeads(await filterAccessibleLeadIds(leadIds, { userId, organizationId }), tagName, organizationId);
  revalidatePath("/leads");
  return tag;
}
