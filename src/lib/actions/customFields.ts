"use server";

import { requireOrg, requirePermission, hasPermission } from "@/lib/rbac";
import { CustomFieldService, customFieldsTag } from "@/domains/customFields/service";
import { AuditService } from "@/domains/audit/service";
import { CUSTOM_FIELD_TYPES } from "@/lib/customFields/types";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

// Feeds the lead Add/Edit forms and detail view. Non-admins never receive admin-only defs, so
// those fields are neither rendered nor submittable through the normal UI.
export async function listCustomFieldsAction() {
  const { organizationId } = await requireOrg();
  if (!organizationId) return [];
  const isAdmin = await hasPermission("settings.manage");
  const fields = await CustomFieldService.listCached(organizationId);
  return isAdmin ? fields : fields.filter((f) => !f.adminOnly);
}

function refresh(organizationId: string) {
  revalidateTag(customFieldsTag(organizationId));
  revalidatePath("/settings/custom-fields");
  revalidatePath("/leads");
  revalidatePath("/");
}

const createSchema = z.object({
  label: z.string().trim().min(1, "Enter a label.").max(100, "Keep the label under 100 characters."),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string().trim().max(100, "Keep each option under 100 characters.")).default([]),
  required: z.boolean().default(false),
  defaultValue: z.string().max(2000).nullish(),
  adminOnly: z.boolean().default(false),
  showOnTable: z.boolean().default(false),
  // Optional two-level grouping (section / sub-section) for the lead detail view.
  section: z.string().trim().max(100).nullish(),
  subsection: z.string().trim().max(100).nullish(),
});

export async function createCustomFieldAction(input: z.input<typeof createSchema>) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    return fail("VALIDATION", Object.values(fieldErrors)[0] ?? "Please check the field.", fieldErrors);
  }
  try {
    const row = await CustomFieldService.create(organizationId, parsed.data);
    await AuditService.log({ organizationId, userId, action: "custom_field.create", entityType: "custom_field", entityId: row.id, metadata: { key: row.key, type: row.type } });
    refresh(organizationId);
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

const updateSchema = z.object({
  id: z.guid(),
  label: z.string().trim().min(1, "Enter a label.").max(100, "Keep the label under 100 characters.").optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().max(100, "Keep each option under 100 characters.")).optional(),
  defaultValue: z.string().max(2000).nullish(),
  disabled: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
  showOnTable: z.boolean().optional(),
  section: z.string().trim().max(100).nullish(),
  subsection: z.string().trim().max(100).nullish(),
});

export async function updateCustomFieldAction(input: z.input<typeof updateSchema>) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    return fail("VALIDATION", Object.values(fieldErrors)[0] ?? "Please check the field.", fieldErrors);
  }
  const { id, ...patch } = parsed.data;
  try {
    const row = await CustomFieldService.update(organizationId, id, patch);
    if (!row) return fail("NOT_FOUND", "This field no longer exists. Reload the page.");
    await AuditService.log({ organizationId, userId, action: "custom_field.update", entityType: "custom_field", entityId: id, metadata: { key: row.key, changed: Object.keys(patch) } });
    refresh(organizationId);
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function reorderCustomFieldsAction(orderedIds: string[]) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = z.array(z.guid()).max(500).safeParse(orderedIds);
  if (!parsed.success) return fail("VALIDATION", "Couldn't save the new order. Reload and try again.");
  try {
    const res = await CustomFieldService.reorder(organizationId, parsed.data);
    refresh(organizationId);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

// What deleting a field (or removing some of its options) would affect — shown before confirming.
export async function customFieldUsageAction(id: string, removedOptions: string[] = []) {
  const { organizationId } = await requirePermission("settings.manage");
  if (!z.guid().safeParse(id).success) return fail("VALIDATION", "Invalid field.");
  try {
    const usage = await CustomFieldService.usage(organizationId, id, removedOptions.slice(0, 200));
    if (!usage) return fail("NOT_FOUND", "This field no longer exists. Reload the page.");
    return ok(usage);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteCustomFieldAction(id: string) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  if (!z.guid().safeParse(id).success) return fail("VALIDATION", "Invalid field.");
  try {
    const deleted = await CustomFieldService.remove(organizationId, id);
    if (!deleted) return fail("NOT_FOUND", "This field was already deleted.");
    await AuditService.log({ organizationId, userId, action: "custom_field.delete", entityType: "custom_field", entityId: id });
    refresh(organizationId);
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
