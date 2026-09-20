"use server";

import { requireOrg, assertWritable } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { SavedViewService, FilterGroup, FilterRule } from "@/domains/savedViews/service";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const createViewSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  filters: z.any(),
  sortField: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export async function createSavedViewAction(input: {
  name: string;
  filters: FilterGroup | FilterRule[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}) {
  const { userId, organizationId } = await assertWritable();
  const parsed = createViewSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please give this view a name.", zodFieldErrors(parsed.error));
  }

  try {
    const view = await SavedViewService.createView(
      {
        name: parsed.data.name,
        filters: parsed.data.filters,
        sortField: parsed.data.sortField,
        sortOrder: parsed.data.sortOrder,
      },
      userId,
      organizationId,
    );

    revalidatePath("/leads");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateSavedViewAction(input: {
  id: string;
  name?: string;
  filters?: FilterGroup | FilterRule[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}) {
  const { organizationId } = await assertWritable();
  if (!input.id) return fail("VALIDATION", "No view was specified.");

  try {
    const view = await SavedViewService.updateView(
      input.id,
      {
        name: input.name,
        filters: input.filters,
        sortField: input.sortField,
        sortOrder: input.sortOrder,
      },
      organizationId,
    );
    if (!view) return fail("NOT_FOUND", "This saved view no longer exists.");

    revalidatePath("/leads");
    return ok(view);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteSavedViewAction(id: string) {
  const { organizationId } = await assertWritable();
  if (!id) return fail("VALIDATION", "No view was specified.");

  try {
    const success = await SavedViewService.deleteView(id, organizationId);
    revalidatePath("/leads");
    return ok({ success });
  } catch (e) {
    return actionFail(e);
  }
}

export async function getSavedViewsAction() {
  const { userId, organizationId } = await requireOrg();
  return SavedViewService.listViews(organizationId, userId);
}
