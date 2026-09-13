"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { CustomFieldService } from "@/domains/customFields/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

export async function listCustomFieldsAction() {
  const { organizationId } = await requireOrg();
  const fields = await CustomFieldService.list(organizationId);
  console.log(`[CustomFields:Server] listCustomFieldsAction: org=${organizationId} count=${fields.length}`, fields.map((f) => ({ key: f.key, label: f.label, disabled: f.disabled })));
  return fields;
}

const TYPES = ["text", "textarea", "number", "currency", "date", "datetime", "select", "multiselect", "checkbox", "url"] as const;

const createSchema = z.object({
  label: z.string().trim().min(1).max(100),
  type: z.enum(TYPES),
  options: z.array(z.string().trim().min(1)).default([]),
  required: z.boolean().default(false),
  defaultValue: z.string().max(2000).nullish(),
  disabled: z.boolean().default(false),
  adminOnly: z.boolean().default(false),
  showOnTable: z.boolean().default(false),
  // Optional two-level grouping (tab / sub-tab) for the lead detail view.
  section: z.string().trim().max(100).nullish(),
  subsection: z.string().trim().max(100).nullish(),
});

export async function createCustomFieldAction(input: z.infer<typeof createSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please provide a label and a valid field type.", zodFieldErrors(parsed.error));
  try {
    const row = await CustomFieldService.create(organizationId, parsed.data);
    revalidatePath("/settings/custom-fields");
    revalidatePath("/leads");
    revalidatePath("/");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(100).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  defaultValue: z.string().max(2000).nullish(),
  disabled: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
  showOnTable: z.boolean().optional(),
  section: z.string().trim().max(100).nullish(),
  subsection: z.string().trim().max(100).nullish(),
});

export async function updateCustomFieldAction(input: z.infer<typeof updateSchema>) {
  const { organizationId } = await requirePermission("settings.manage");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please check the field details and try again.", zodFieldErrors(parsed.error));
  const { id, ...patch } = parsed.data;
  try {
    const row = await CustomFieldService.update(organizationId, id, patch);
    revalidatePath("/settings/custom-fields");
    revalidatePath("/leads");
    revalidatePath("/");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function reorderCustomFieldsAction(orderedIds: string[]) {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    const res = await CustomFieldService.reorder(organizationId, orderedIds);
    revalidatePath("/settings/custom-fields");
    revalidatePath("/leads");
    revalidatePath("/");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteCustomFieldAction(id: string) {
  const { organizationId } = await requirePermission("settings.manage");
  try {
    await CustomFieldService.remove(organizationId, id);
    revalidatePath("/settings/custom-fields");
    revalidatePath("/leads");
    revalidatePath("/");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
