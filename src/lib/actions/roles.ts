"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { RoleService } from "@/domains/roles/service";
import { AuditService } from "@/domains/audit/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function listRolesAction() {
  const { organizationId } = await requireOrg();
  return RoleService.list(organizationId);
}

const roleSchema = z.object({
  name: z.string().trim().min(1).max(255),
  permissions: z.array(z.string()).default([]),
});

export async function createRoleAction(input: z.infer<typeof roleSchema>) {
  const { organizationId, userId } = await requirePermission("roles.manage");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please enter a role name.");
  try {
    const role = await RoleService.create(organizationId, parsed.data.name, parsed.data.permissions);
    await AuditService.log({ organizationId, userId, action: "role.create", entityType: "role", entityId: role?.id, metadata: { name: parsed.data.name } });
    revalidatePath("/settings/users");
    return ok(role);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateRoleAction(id: string, raw: Partial<z.infer<typeof roleSchema>>) {
  const { organizationId, userId } = await requirePermission("roles.manage");
  const parsed = roleSchema.partial().safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Please enter a role name.");
  const input = parsed.data;
  try {
    const before = await RoleService.getById(organizationId, id);
    const role = await RoleService.update(organizationId, id, input);
    if (!role) return fail("NOT_FOUND", "That role no longer exists.");
    if (input.permissions !== undefined) {
      const beforePerms = new Set(before?.permissions ?? []);
      const afterPerms = new Set(role.permissions ?? []);
      const added = [...afterPerms].filter((p) => !beforePerms.has(p));
      const removed = [...beforePerms].filter((p) => !afterPerms.has(p));
      // Only log when the permission set actually moved — a name-only rename shouldn't
      // manufacture an empty added/removed pair.
      if (added.length || removed.length) {
        await AuditService.log({ organizationId, userId, action: "role.update", entityType: "role", entityId: id, metadata: { name: role.name, added, removed } });
      }
    }
    revalidatePath("/settings/users");
    return ok(role);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteRoleAction(id: string) {
  const { organizationId, userId } = await requirePermission("roles.manage");
  try {
    const removed = await RoleService.remove(organizationId, id);
    if (!removed) return fail("NOT_FOUND", "That role no longer exists.");
    await AuditService.log({ organizationId, userId, action: "role.delete", entityType: "role", entityId: id, metadata: { name: removed.name } });
    revalidatePath("/settings/users");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
