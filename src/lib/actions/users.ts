"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath, unstable_cache, revalidateTag } from "next/cache";
import { UserService } from "@/domains/users/service";
import { AuditService } from "@/domains/audit/service";
import { PlanService } from "@/domains/billing/planService";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

// Active users of the caller's org for owner/assignee pickers. Returns a display name, not the raw record.
// The active-user picker list rarely changes — cache it 60s per org. Safe to cache: it returns
// only strings (no Date columns that unstable_cache's JSON serialization would mangle). Invalidated
// immediately by revalidateTag("active-users") on user create / activate-toggle / delete below.
const getActiveUsersCached = unstable_cache(
  (organizationId: string) =>
    db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt))),
  ["active-users"],
  { revalidate: 60, tags: ["active-users"] },
);

export async function listUsersAction() {
  const { organizationId } = await requireOrg();
  const rows = await getActiveUsersCached(organizationId);
  return rows.map((u) => ({
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
  }));
}

// --- Full user management (requires users.manage, tenant-scoped) ---

export async function listAllUsersAction() {
  const { organizationId } = await requirePermission("users.manage");
  return UserService.list(organizationId);
}

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().max(255).optional(),
  lastName: z.string().trim().max(255).optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  roleId: z.string().uuid().nullable().optional(),
});

export async function createUserAction(input: z.infer<typeof createUserSchema>) {
  const { organizationId, userId } = await requirePermission("users.manage");
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please provide a valid email and a password of at least 6 characters.", zodFieldErrors(parsed.error));
  }
  const data = parsed.data;
  try {
    await PlanService.assertCanAddSeat(organizationId);
    const user = await UserService.create(organizationId, data);
    await AuditService.log({ organizationId, userId, action: "user.create", entityType: "user", entityId: user.id, metadata: { email: data.email } });
    revalidatePath("/settings/users");
    revalidateTag("active-users");
    return ok(user);
  } catch (e: any) {
    // Unique violation on email.
    if (String(e?.message || e).includes("duplicate") || e?.code === "23505") {
      return fail("CONFLICT", "A user with that email already exists.", { email: "This email is already in use." });
    }
    return actionFail(e);
  }
}

export async function setUserActiveAction(id: string, isActive: boolean) {
  const { organizationId, userId } = await requirePermission("users.manage");
  if (id === userId && !isActive) return fail("VALIDATION", "You can't deactivate your own account.");
  try {
    const u = await UserService.setActive(organizationId, id, isActive);
    if (!u) return fail("NOT_FOUND", "That user no longer exists. Refresh the page.");
    await AuditService.log({ organizationId, userId, action: isActive ? "user.activate" : "user.deactivate", entityType: "user", entityId: id });
    revalidateTag("active-users");
    revalidatePath("/settings/users");
    return ok({ id, isActive });
  } catch (e) {
    return actionFail(e);
  }
}

export async function setUserTeamAction(id: string, teamId: string | null) {
  const { organizationId } = await requirePermission("users.manage");
  try {
    const u = await UserService.setTeam(organizationId, id, teamId);
    if (!u) return fail("NOT_FOUND", "That user no longer exists. Refresh the page.");
    revalidatePath("/settings/users");
    return ok({ id, teamId });
  } catch (e) {
    return actionFail(e);
  }
}

export async function setUserRoleAction(id: string, roleId: string | null) {
  const { organizationId, userId } = await requirePermission("users.manage");
  if (id === userId) return fail("VALIDATION", "You can't change your own role.");
  try {
    const u = await UserService.setRole(organizationId, id, roleId);
    if (!u) return fail("NOT_FOUND", "That user no longer exists. Refresh the page.");
    await AuditService.log({ organizationId, userId, action: "user.role_change", entityType: "user", entityId: id, metadata: { roleId } });
    revalidatePath("/settings/users");
    return ok({ id, roleId });
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteUserAction(id: string) {
  const { organizationId, userId } = await requirePermission("users.manage");
  if (id === userId) return fail("VALIDATION", "You can't delete your own account.");
  try {
    const u = await UserService.remove(organizationId, id);
    if (!u) return fail("NOT_FOUND", "That user no longer exists. Refresh the page.");
    revalidateTag("active-users");
    await AuditService.log({ organizationId, userId, action: "user.delete", entityType: "user", entityId: id });
    revalidatePath("/settings/users");
    return ok({ id });
  } catch (e) {
    return actionFail(e);
  }
}
