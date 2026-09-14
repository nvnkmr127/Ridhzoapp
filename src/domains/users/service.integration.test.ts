import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { users, roles, organizations, invitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UserService, LAST_ADMIN_ERROR } from "./service";
import { InvitationService } from "@/domains/invitations/service";
import { RoleService } from "@/domains/roles/service";

// These exercise real transactions, jsonb SQL, and the global-unique email constraint against a
// live Postgres, so they only run when DATABASE_URL points at a local dev DB. CI without a DB skips.
const RUN = !!process.env.DATABASE_URL?.includes("localhost");
const stamp = Date.now();
const orgId = crypto.randomUUID();
let adminRoleId = "";

describe.runIf(RUN)("UserService — /settings/users regressions", () => {
  beforeAll(async () => {
    await db.insert(organizations).values({ id: orgId, name: `IT ${stamp}`, slug: `it-${stamp}` });
    [{ id: adminRoleId }] = await db
      .insert(roles)
      .values({ organizationId: orgId, name: "Manager", permissions: ["*"] })
      .returning({ id: roles.id });
  });

  afterAll(async () => {
    await db.delete(invitations).where(eq(invitations.organizationId, orgId));
    await db.delete(users).where(eq(users.organizationId, orgId));
    await db.delete(roles).where(eq(roles.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("BUG-B: blocks removing the last active admin, allows it once a second admin exists", async () => {
    const a = await UserService.create(orgId, { email: `a-${stamp}@it.test`, password: "secret6", roleId: adminRoleId });
    await expect(UserService.remove(orgId, a.id)).rejects.toThrow(LAST_ADMIN_ERROR);
    await expect(UserService.setActive(orgId, a.id, false)).rejects.toThrow(LAST_ADMIN_ERROR);

    const b = await UserService.create(orgId, { email: `b-${stamp}@it.test`, password: "secret6", roleId: adminRoleId });
    const removed = await UserService.remove(orgId, a.id); // now two admins -> allowed
    expect(removed?.id).toBe(a.id);
    // b is now the last admin
    await expect(UserService.remove(orgId, b.id)).rejects.toThrow(LAST_ADMIN_ERROR);
  });

  it("BUG-B: does not block removing a non-admin", async () => {
    const admin = await UserService.create(orgId, { email: `adm-${stamp}@it.test`, password: "secret6", roleId: adminRoleId });
    const member = await UserService.create(orgId, { email: `mem-${stamp}@it.test`, password: "secret6", roleId: null });
    const removed = await UserService.remove(orgId, member.id);
    expect(removed?.id).toBe(member.id);
    await UserService.remove(orgId, admin.id).catch(() => {}); // ignore last-admin guard on cleanup
  });

  it("BUG-C: mutations no-op on a soft-deleted user and never clear the tombstone", async () => {
    const m = await UserService.create(orgId, { email: `c-${stamp}@it.test`, password: "secret6", roleId: null });
    await UserService.remove(orgId, m.id);
    expect(await UserService.setActive(orgId, m.id, true)).toBeUndefined();
    expect(await UserService.setRole(orgId, m.id, adminRoleId)).toBeUndefined();
    expect(await UserService.setTeam(orgId, m.id, null)).toBeUndefined();
    const [row] = await db.select().from(users).where(eq(users.id, m.id));
    expect(row.deletedAt).not.toBeNull();
    expect(row.isActive).toBe(false);
  });

  it("BUG-A: re-inviting a soft-deleted email restores the same row instead of failing", async () => {
    const email = `reinvite-${stamp}@it.test`;
    const u = await UserService.create(orgId, { email, password: "secret6", roleId: null });
    await UserService.remove(orgId, u.id);
    const { token } = await InvitationService.create(orgId, email, adminRoleId, u.id);
    const accepted = await InvitationService.accept(token, { password: "secret6", firstName: "Restored" });
    expect(accepted.id).toBe(u.id); // same row reused, not a unique-constraint crash
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.deletedAt).toBeNull();
    expect(row.isActive).toBe(true);
    expect(row.roleId).toBe(adminRoleId);
  });

  it("BUG-D: RoleService rejects reserved names", async () => {
    await expect(RoleService.create(orgId, "Admin", ["*"])).rejects.toThrow(/reserved/i);
    await expect(RoleService.create(orgId, "member", [])).rejects.toThrow(/reserved/i);
  });
});
