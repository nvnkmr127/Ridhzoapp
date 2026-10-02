"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { WhatsAppSettingsService } from "@/domains/organizations/whatsappSettingsService";
import { AuditService } from "@/domains/audit/service";
import { ok, fail, actionFail } from "@/lib/actions/result";

const saveSchema = z.object({
  apiKey: z.string().trim().max(500).optional(),
  tenantId: z.string().trim().max(64).nullable().optional(),
});

export async function getWhatsAppSettingsAction() {
  const { organizationId } = await requirePermission("settings.manage");
  return WhatsAppSettingsService.getView(organizationId);
}

export async function saveWhatsAppSettingsAction(input: z.input<typeof saveSchema>) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Check the API key and tenant id.");
  try {
    const view = await WhatsAppSettingsService.save(organizationId, parsed.data);
    await AuditService.log({ organizationId, userId, action: "integration.whatsapp_connect", entityType: "organization", entityId: organizationId });
    revalidatePath("/settings/integrations");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function disconnectWhatsAppAction() {
  const { organizationId, userId } = await requirePermission("settings.manage");
  try {
    const view = await WhatsAppSettingsService.disconnect(organizationId);
    await AuditService.log({ organizationId, userId, action: "integration.whatsapp_disconnect", entityType: "organization", entityId: organizationId });
    revalidatePath("/settings/integrations");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function rotateWhatsAppInboundTokenAction() {
  const { organizationId, userId } = await requirePermission("settings.manage");
  try {
    const view = await WhatsAppSettingsService.rotateInboundToken(organizationId);
    await AuditService.log({ organizationId, userId, action: "integration.whatsapp_token_rotate", entityType: "organization", entityId: organizationId });
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}
