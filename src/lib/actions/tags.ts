"use server";

import { requireOrg, assertWritable } from "@/lib/rbac";
import { TagService } from "@/domains/tags/service";
import { revalidatePath } from "next/cache";

export async function listTagsAction() {
  const { organizationId } = await requireOrg();
  return TagService.listAll(organizationId);
}

export async function addTagAction(leadId: string, name: string) {
  const { organizationId } = await assertWritable();
  const tag = await TagService.addToLead(leadId, name, organizationId);
  revalidatePath(`/leads/${leadId}`);
  return tag;
}

export async function removeTagAction(leadId: string, tagId: string) {
  const { organizationId } = await assertWritable();
  await TagService.removeFromLead(leadId, tagId, organizationId);
  revalidatePath(`/leads/${leadId}`);
}

export async function bulkAddTagAction(leadIds: string[], tagName: string) {
  const { organizationId } = await assertWritable();
  const tag = await TagService.bulkAddToLeads(leadIds, tagName, organizationId);
  revalidatePath("/leads");
  return tag;
}
