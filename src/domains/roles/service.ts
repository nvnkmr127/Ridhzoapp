import { db } from "@/db";
import { UserFacingError } from "@/lib/actions/result";
import { roles, users, invitations } from "@/db/schema";
import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { forgetRole } from "@/lib/rbac/roleCache";

const cols = { id: roles.id, name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId };

// Keep only recognised permission keys — never trust caller-supplied strings.
function clean(permissions: string[]) {
  return ALL_PERMISSIONS.filter((k) => permissions.includes(k));
}

// Names reserved for shared system roles. A tenant role must not use them: "admin" in particular
// is a magic name the RBAC layer treats specially, so allowing a custom "admin" would be confusing
// even now that hasPermission ignores the name for tenant roles.
const RESERVED_NAMES = new Set(["admin", "member"]);
function assertNameAllowed(name: string) {
  if (RESERVED_NAMES.has(name.trim().toLowerCase())) {
    throw new Error(`"${name.trim()}" is a reserved role name. Please choose a different name.`);
  }
}

export class RoleService {
  // Shared system roles (org null) plus this org's custom roles.
  static async list(organizationId: string) {
    return db
      .select(cols)
      .from(roles)
      .where(or(isNull(roles.organizationId), eq(roles.organizationId, organizationId)))
      .orderBy(roles.name);
  }

  static async getById(organizationId: string, id: string) {
    const [r] = await db
      .select(cols)
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.organizationId, organizationId)))
      .limit(1);
    return r;
  }

  static async create(organizationId: string, name: string, permissions: string[]) {
    assertNameAllowed(name);
    const [r] = await db
      .insert(roles)
      .values({ organizationId, name, permissions: clean(permissions) })
      .returning(cols);
    return r;
  }

  // Only org-owned roles are editable — never a shared system role.
  static async update(organizationId: string, id: string, data: { name?: string; permissions?: string[] }) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) { assertNameAllowed(data.name); set.name = data.name; }
    if (data.permissions !== undefined) set.permissions = clean(data.permissions);
    const [r] = await db
      .update(roles)
      .set(set)
      .where(and(eq(roles.id, id), eq(roles.organizationId, organizationId)))
      .returning(cols);
    forgetRole(id);
    return r;
  }

  // Live members per role in this org — shown next to each role, and blocks deleting a role in use.
  static async memberCounts(organizationId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({ roleId: users.roleId, n: count() })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)))
      .groupBy(users.roleId);
    return Object.fromEntries(rows.filter((r) => r.roleId).map((r) => [r.roleId!, Number(r.n)]));
  }

  // Returns the deleted row (undefined if no such role existed in this org) so the caller can
  // tell a real deletion from a no-op — e.g. before writing an audit entry. Refuses while anyone
  // (member or open invite) still holds the role: silently un-roling them would change their access.
  static async remove(organizationId: string, id: string) {
    const [{ n: members }] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.roleId, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)));
    const [{ n: invites }] = await db
      .select({ n: count() })
      .from(invitations)
      .where(and(eq(invitations.roleId, id), eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
    if (Number(members) + Number(invites) > 0) {
      throw new UserFacingError(`This role is still used by ${Number(members)} member(s) and ${Number(invites)} pending invite(s). Give them another role first.`);
    }
    // Deleted members keep a tombstoned roleId; detach it so the FK doesn't block the delete.
    await db
      .update(users)
      .set({ roleId: null, updatedAt: new Date() })
      .where(and(eq(users.roleId, id), eq(users.organizationId, organizationId)));
    const [r] = await db
      .delete(roles)
      .where(and(eq(roles.id, id), eq(roles.organizationId, organizationId)))
      .returning(cols);
    forgetRole(id);
    return r;
  }
}
