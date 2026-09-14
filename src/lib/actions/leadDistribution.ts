"use server";

import { requirePermission } from "@/lib/rbac";
import { LeadDistributionService } from "@/domains/integrations/leadDistributionService";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

const createSchema = z.object({
  sourceId: z.string().uuid().nullable(),
  recipients: z.array(z.string().email("One of the recipient emails is invalid")).min(1, "Add at least one recipient email"),
  skipSave: z.boolean(),
});

export async function listDistributionRulesAction() {
  const { organizationId } = await requirePermission("api.manage");
  return LeadDistributionService.list(organizationId);
}

export async function createDistributionRuleAction(input: { sourceId: string | null; recipients: string[]; skipSave: boolean }) {
  const { organizationId } = await requirePermission("api.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please provide a valid rule.");
  }
  try {
    const row = await LeadDistributionService.create(organizationId, parsed.data);
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleDistributionRuleAction(id: string, isActive: boolean) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const row = await LeadDistributionService.setActive(organizationId, id, isActive);
    if (!row) return fail("NOT_FOUND", "This rule no longer exists.");
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteDistributionRuleAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    await LeadDistributionService.remove(organizationId, id);
    revalidatePath("/settings/distribution");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
