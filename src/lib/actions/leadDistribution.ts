"use server";

import { requirePermission } from "@/lib/rbac";
import { LeadDistributionService, DISTRIBUTION_CHANNELS } from "@/domains/integrations/leadDistributionService";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

const createSchema = z.object({
  channel: z.enum(DISTRIBUTION_CHANNELS),
  destination: z.string().email("Enter a valid email address").max(320),
});

export async function listDistributionRecipientsAction() {
  const { organizationId } = await requirePermission("api.manage");
  return LeadDistributionService.list(organizationId);
}

export async function createDistributionRecipientAction(input: { channel: string; destination: string }) {
  const { organizationId } = await requirePermission("api.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please provide a valid recipient.");
  }
  try {
    const row = await LeadDistributionService.create(organizationId, parsed.data.channel, parsed.data.destination);
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleDistributionRecipientAction(id: string, isActive: boolean) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    const row = await LeadDistributionService.setActive(organizationId, id, isActive);
    if (!row) return fail("NOT_FOUND", "This recipient no longer exists.");
    revalidatePath("/settings/distribution");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteDistributionRecipientAction(id: string) {
  const { organizationId } = await requirePermission("api.manage");
  try {
    await LeadDistributionService.remove(organizationId, id);
    revalidatePath("/settings/distribution");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
