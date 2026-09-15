"use server";

import { requirePermission } from "@/lib/rbac";
import { ApiKeyService } from "@/domains/apiKeys/service";
import { AuditService } from "@/domains/audit/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function listApiKeysAction() {
  const { organizationId } = await requirePermission("api.manage");
  return ApiKeyService.list(organizationId);
}

export async function createApiKeyAction(name: string, scope: "full" | "read_only" = "full") {
  const { organizationId, userId } = await requirePermission("api.manage");
  const parsed = z.string().trim().min(1).max(255).safeParse(name);
  if (!parsed.success) return fail("VALIDATION", "Please enter a name for this API key.");
  const scopeParsed = z.enum(["full", "read_only"]).safeParse(scope);
  if (!scopeParsed.success) return fail("VALIDATION", "Invalid key scope.");
  try {
    const created = await ApiKeyService.create(organizationId, parsed.data, userId, scopeParsed.data);
    await AuditService.log({ organizationId, userId, action: "api_key.create", entityType: "api_key", entityId: created.id, metadata: { name: parsed.data, scope: scopeParsed.data } });
    revalidatePath("/settings/api");
    return ok(created); // includes the raw key — shown once
  } catch (e) {
    return actionFail(e);
  }
}

export async function revokeApiKeyAction(id: string) {
  const { organizationId, userId } = await requirePermission("api.manage");
  try {
    await ApiKeyService.revoke(organizationId, id);
    await AuditService.log({ organizationId, userId, action: "api_key.revoke", entityType: "api_key", entityId: id });
    revalidatePath("/settings/api");
    return ok({ revoked: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteApiKeyAction(id: string) {
  const { organizationId, userId } = await requirePermission("api.manage");
  try {
    await ApiKeyService.remove(organizationId, id);
    await AuditService.log({ organizationId, userId, action: "api_key.delete", entityType: "api_key", entityId: id });
    revalidatePath("/settings/api");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
