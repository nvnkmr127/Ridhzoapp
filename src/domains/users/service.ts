import { db } from "@/db";
import { UserFacingError } from "@/lib/actions/result";
import { handOverFollowUps } from "@/domains/follow-ups/state";
import { users, roles, teams, leads } from "@/db/schema";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
    input: { email: string; firstName?: string; lastName?: string; password: string; roleId: string },
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
            roleId: input.roleId,
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
        roleId: input.roleId,
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
  // Open (non-deleted) leads owned per member — shown when deactivating/deleting someone.
  static async leadCounts(organizationId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({ ownerId: leads.ownerId, n: count() })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
      .groupBy(leads.ownerId);
    return Object.fromEntries(rows.filter((r) => r.ownerId).map((r) => [r.ownerId!, Number(r.n)]));
  }

  // Hand a departing member's leads to `toId` (an active member of the same org) or leave them
  // unassigned (null). Runs inside the caller's transaction so it commits with the deactivate/delete.
  // ponytail: a direct owner update — no per-lead lead.assigned events, so hundreds of leads don't
  // fan out hundreds of notifications/automations; switch to AssignmentService if those are wanted.
  private static async reassignLeads(tx: Tx, organizationId: string, fromId: string, toId: string | null) {
    if (toId) {
      if (toId === fromId) throw new UserFacingError("Pick someone else to take over their leads.");
      const [target] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, toId), eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt)))
        .limit(1);
      if (!target) throw new UserFacingError("The person you picked to take over their leads isn't an active member.");
    }
    const moved = await tx
      .update(leads)
      .set({ ownerId: toId, updatedAt: new Date() })
      .where(and(eq(leads.ownerId, fromId), eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
      .returning({ id: leads.id });
    // Their pending follow-ups on those leads go to the new owner too (or become unassigned).
    await handOverFollowUps(moved.map((l) => l.id), fromId, toId, tx);
    return moved.length;
  }

  static async setActive(organizationId: string, id: string, isActive: boolean, reassignTo?: string | null) {
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
      const leadsMoved = u && reassignTo !== undefined ? await this.reassignLeads(tx, organizationId, id, reassignTo) : 0;
      return u && { ...u, leadsMoved };
    });
  }

  static async setTeam(organizationId: string, id: string, teamId: string | null) {
    if (teamId) {
      const [t] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, teamId), eq(teams.organizationId, organizationId))).limit(1);
      if (!t) throw new UserFacingError("That team no longer exists. Refresh the page.");
    }
    const [u] = await db
      .update(users)
      .set({ teamId, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
      .returning(publicCols);
    return u;
  }

  static async setRole(organizationId: string, id: string, roleId: string) {
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
  static async remove(organizationId: string, id: string, reassignTo?: string | null) {
    return db.transaction(async (tx) => {
      const before = await this.countActiveAdmins(tx, organizationId);
      const [u] = await tx
        .update(users)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .returning(publicCols);
      if (u && before > 0 && (await this.countActiveAdmins(tx, organizationId)) === 0) throw new Error(LAST_ADMIN_ERROR);
      const leadsMoved = u && reassignTo !== undefined ? await this.reassignLeads(tx, organizationId, id, reassignTo) : 0;
      return u && { ...u, leadsMoved };
    });
  }
}
