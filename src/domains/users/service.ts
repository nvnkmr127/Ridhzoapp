import { db } from "@/db";
import { users, roles } from "@/db/schema";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Thrown when an operation would leave the org with zero active administrators. Actions map this
// to a friendly validation message (see actionFail).
export const LAST_ADMIN_ERROR = "Cannot remove the last active administrator of this organization.";

// A user counts as an admin (for lockout protection) if their role can manage users: it holds the
// users.manage key, the "*" wildcard, or is the shared system admin role. Mirrors hasPermission.
const roleIsAdminSql = sql`(
  ${roles.permissions} @> '["users.manage"]'::jsonb
  OR ${roles.permissions} @> '["*"]'::jsonb
  OR (${roles.organizationId} IS NULL AND lower(${roles.name}) = 'admin')
)`;

// Public shape — never leaks passwordHash.
const publicCols = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  isActive: users.isActive,
  roleId: users.roleId,
  teamId: users.teamId,
  createdAt: users.createdAt,
};

// Every method is tenant-scoped: it takes organizationId from the caller (which reads it
// from the session, never user input) and filters on it. Deleted users are hidden.
export class UserService {
  static async list(organizationId: string) {
    return db
      .select(publicCols)
      .from(users)
      .where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)))
      .orderBy(users.createdAt);
  }

  static async create(
    organizationId: string,
    input: { email: string; firstName?: string; lastName?: string; password: string; roleId?: string | null },
  ) {
    const cleanEmail = input.email.trim().toLowerCase();
    const [existing] = await db
      .select({ id: users.id, organizationId: users.organizationId, deletedAt: users.deletedAt, firstName: users.firstName, lastName: users.lastName, roleId: users.roleId })
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    const passwordHash = await bcrypt.hash(input.password, 10);

    if (existing) {
      if (existing.organizationId === organizationId && existing.deletedAt) {
        const [restored] = await db
          .update(users)
          .set({
            firstName: input.firstName || existing.firstName,
            lastName: input.lastName || existing.lastName,
            roleId: input.roleId !== undefined ? input.roleId : existing.roleId,
            passwordHash,
            isActive: true,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning(publicCols);
        return restored;
      }
      throw new Error("A user with that email already exists");
    }

    const [u] = await db
      .insert(users)
      .values({
        organizationId,
        email: cleanEmail,
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: input.roleId ?? null,
        passwordHash,
        isActive: true,
      })
      .returning(publicCols);
    return u;
  }

  // Count active, non-deleted admins in the org (optionally within a transaction). Used to block
  // actions that would lock everyone out of user management.
  private static async countActiveAdmins(dbOrTx: { select: typeof db.select }, organizationId: string) {
    const [row] = await dbOrTx
      .select({ n: count() })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt), roleIsAdminSql));
    return Number(row?.n ?? 0);
  }

  // Mutations below scope on isNull(deletedAt) so a soft-deleted (tombstoned) user can't be
  // resurrected or edited into an inconsistent state. They return undefined when no live row matched
  // (the caller reports NOT_FOUND). Admin-reducing ops run in a transaction that re-counts admins
  // AFTER the write and rolls back if it hit zero — closing the concurrent last-admin race.
  static async setActive(organizationId: string, id: string, isActive: boolean) {
    if (isActive) {
      const [u] = await db
        .update(users)
        .set({ isActive, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .returning(publicCols);
      return u;
    }
    return db.transaction(async (tx) => {
      const before = await this.countActiveAdmins(tx, organizationId);
      const [u] = await tx
        .update(users)
        .set({ isActive, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .returning(publicCols);
      // Only block when THIS write took the org from ≥1 admin to 0 (never in an already-adminless org,
      // and never when deactivating a non-admin).
      if (u && before > 0 && (await this.countActiveAdmins(tx, organizationId)) === 0) throw new Error(LAST_ADMIN_ERROR);
      return u;
    });
  }

  static async setTeam(organizationId: string, id: string, teamId: string | null) {
    const [u] = await db
      .update(users)
      .set({ teamId, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
      .returning(publicCols);
    return u;
  }

  static async setRole(organizationId: string, id: string, roleId: string | null) {
    return db.transaction(async (tx) => {
      const before = await this.countActiveAdmins(tx, organizationId);
      const [u] = await tx
        .update(users)
        .set({ roleId, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .returning(publicCols);
      // Demoting the last admin to a non-admin role would lock the org out of user management.
      if (u && before > 0 && (await this.countActiveAdmins(tx, organizationId)) === 0) throw new Error(LAST_ADMIN_ERROR);
      return u;
    });
  }

  // Soft delete — hard delete would orphan leads/activities/notifications that FK to this user.
  // Returns the affected row (undefined if already gone) so the caller can report NOT_FOUND.
  static async remove(organizationId: string, id: string) {
    return db.transaction(async (tx) => {
      const before = await this.countActiveAdmins(tx, organizationId);
      const [u] = await tx
        .update(users)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .returning(publicCols);
      if (u && before > 0 && (await this.countActiveAdmins(tx, organizationId)) === 0) throw new Error(LAST_ADMIN_ERROR);
      return u;
    });
  }
}
