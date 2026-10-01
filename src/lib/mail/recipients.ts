// Who should get a workspace email: everyone who actually holds the permission it concerns — not just
// people whose role happens to be named "admin". A custom "Accounts" role with billing.manage gets the
// billing emails; a plain Member doesn't. Honours each person's email opt-outs. Skips placeholder
// (phone-only) addresses unless `anyAddress` (in-app notifications don't need an email).
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, roles } from "@/db/schema";
import type { PermissionKey } from "@/lib/permissions";
import { roleGrants } from "@/lib/rbac/grants";

const PLACEHOLDER = "@phone.ridhzo.com"; // same as lib/auth/googleLink.PHONE_EMAIL_DOMAIN

export type Recipient = { id: string; email: string; firstName: string | null };
// With `anyAddress`, phone-only people (no email) are included too.
export type AnyRecipient = { id: string; email: string | null; firstName: string | null };
type Opts = { optOutKey?: string; excludeUserId?: string };

export async function recipientsWithPermission(orgId: string, key: PermissionKey, opts: Opts & { anyAddress: true }): Promise<AnyRecipient[]>;
export async function recipientsWithPermission(orgId: string, key: PermissionKey, opts?: Opts & { anyAddress?: false }): Promise<Recipient[]>;
export async function recipientsWithPermission(orgId: string, key: PermissionKey, opts: Opts & { anyAddress?: boolean } = {}): Promise<AnyRecipient[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, optOut: users.emailOptOut, roleName: roles.name, perms: roles.permissions, roleOrg: roles.organizationId })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.organizationId, orgId), eq(users.isActive, true), isNull(users.deletedAt)));
  return rows
    .filter((u) => u.roleName && roleGrants({ name: u.roleName, permissions: u.perms ?? [], organizationId: u.roleOrg }, key))
    .filter((u) => opts.anyAddress || (u.email && !u.email.endsWith(PLACEHOLDER))) // legacy placeholders stay excluded // anyAddress: in-app alerts reach phone-only users too
    .filter((u) => u.id !== opts.excludeUserId)
    .filter((u) => !opts.optOutKey || !(u.optOut ?? []).includes(opts.optOutKey))
    .map(({ id, email, firstName }) => ({ id, email, firstName }));
}
