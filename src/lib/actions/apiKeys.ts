"use server";

import { requirePermission, emailVerifiedError } from "@/lib/rbac";
import { ApiKeyService } from "@/domains/apiKeys/service";
import { AuditService } from "@/domains/audit/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { API_SCOPE_KEYS } from "@/lib/apiScopes";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function listApiKeysAction() {
  const { organizationId } = await requirePermission("api.manage");
  return ApiKeyService.list(organizationId);
}

// expiresInDays: null = never (allowed, but not the default). New keys expire after a year unless told otherwise.
export async function createApiKeyAction(name: string, scope: "full" | "read_only" = "full", expiresInDays: number | null = 365, scopes: string[] | null = null) {
  const { organizationId, userId } = await requirePermission("api.manage");
  { const gate = await emailVerifiedError(); if (gate) return fail("FORBIDDEN", gate); }
  const parsed = z.string().trim().min(1).max(255).safeParse(name);
  if (!parsed.success) return fail("VALIDATION", "Please enter a name for this API key.");
  const scopeParsed = z.enum(["full", "read_only"]).safeParse(scope);
  if (!scopeParsed.success) return fail("VALIDATION", "Invalid key scope.");
  const scopesParsed = z.array(z.string().refine((s) => API_SCOPE_KEYS.includes(s))).min(1).max(API_SCOPE_KEYS.length).nullable().safeParse(scopes);
  if (!scopesParsed.success) return fail("VALIDATION", "Pick at least one valid permission for this key, or leave it unrestricted.");
  const days = z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).safeParse(expiresInDays);
  if (!days.success) return fail("VALIDATION", "Choose 30, 90 or 365 days, or no expiry.");
  const expiresAt = days.data === null ? null : new Date(Date.now() + days.data * 86_400_000);
  try {
    const created = await ApiKeyService.create(organizationId, parsed.data, userId, scopeParsed.data, expiresAt, scopesParsed.data);
    await AuditService.log({ organizationId, userId, action: "api_key.create", entityType: "api_key", entityId: created.id, metadata: { name: parsed.data, scope: scopeParsed.data, scopes: scopesParsed.data, expiresAt: expiresAt?.toISOString() ?? null } });
    revalidatePath("/settings/api");
    return ok(created); // includes the raw key — shown once
  } catch (e) {
    return actionFail(e);
  }
}

export async function revokeApiKeyAction(id: string) {
  const { organizationId, userId } = await requirePermission("api.manage");
  try {
    const revoked = await ApiKeyService.revoke(organizationId, id);
    if (!revoked) return fail("NOT_FOUND", "That API key no longer exists.");
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
    const removed = await ApiKeyService.remove(organizationId, id);
    if (!removed) return fail("NOT_FOUND", "That API key no longer exists.");
    await AuditService.log({ organizationId, userId, action: "api_key.delete", entityType: "api_key", entityId: id });
    revalidatePath("/settings/api");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
