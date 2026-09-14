import { db } from "@/db";
import { invitations, users } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";

function hash(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const TTL_DAYS = 7;

export class InvitationService {
  static async list(organizationId: string) {
    return db
      .select({ id: invitations.id, email: invitations.email, roleId: invitations.roleId, acceptedAt: invitations.acceptedAt, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(invitations.createdAt);
  }

  // Creates a pending invite and returns the raw token (embed it in the accept link).
  static async create(organizationId: string, email: string, roleId: string | null, invitedById: string) {
    const cleanEmail = email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, cleanEmail), isNull(users.deletedAt))).limit(1);
    if (existing) throw new Error("A user with that email already exists");

    // Remove any earlier pending invitations for this email in this org to avoid duplicate seats
    await db.delete(invitations).where(and(eq(invitations.organizationId, organizationId), eq(invitations.email, cleanEmail), isNull(invitations.acceptedAt)));

    const raw = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
    const [inv] = await db
      .insert(invitations)
      .values({ organizationId, email: cleanEmail, roleId, invitedById, tokenHash: hash(raw), expiresAt })
      .returning({ id: invitations.id, email: invitations.email, roleId: invitations.roleId, expiresAt: invitations.expiresAt });
    return { token: raw, invite: inv };
  }

  // Public: show who/what an invite is for, without leaking whether the token is otherwise valid.
  static async peek(rawToken: string) {
    const [inv] = await db
      .select({ email: invitations.email, organizationId: invitations.organizationId })
      .from(invitations)
      .where(and(eq(invitations.tokenHash, hash(rawToken)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      .limit(1);
    return inv ?? null;
  }

  // Accepts an invite: creates the user in the org with the invited role, then burns the token.
  static async accept(rawToken: string, input: { password: string; firstName?: string; lastName?: string }) {
    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, hash(rawToken)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      .limit(1);
    if (!inv) throw new Error("This invitation is invalid or has expired");

    const passwordHash = await bcrypt.hash(input.password, 10);

    // email is globally UNIQUE, so a previously soft-deleted user still holds this address. A blind
    // INSERT would hit the unique constraint and the invitee could never join. Mirror
    // UserService.create: restore the tombstoned row in the same org; reject a live collision.
    const [existing] = await db
      .select({ id: users.id, organizationId: users.organizationId, deletedAt: users.deletedAt, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.email, inv.email))
      .limit(1);

    let user: { id: string; email: string };
    if (existing) {
      if (existing.organizationId === inv.organizationId && existing.deletedAt) {
        const [restored] = await db
          .update(users)
          .set({
            passwordHash,
            firstName: input.firstName || existing.firstName,
            lastName: input.lastName || existing.lastName,
            roleId: inv.roleId,
            isActive: true,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning({ id: users.id, email: users.email });
        user = restored;
      } else {
        throw new Error("A user with that email already exists");
      }
    } else {
      const [created] = await db
        .insert(users)
        .values({
          organizationId: inv.organizationId,
          email: inv.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          roleId: inv.roleId,
          isActive: true,
        })
        .returning({ id: users.id, email: users.email });
      user = created;
    }

    await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    return user;
  }

  static async revoke(organizationId: string, id: string) {
    await db
      .delete(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt)));
  }
}
