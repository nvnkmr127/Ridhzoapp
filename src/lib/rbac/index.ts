import { cache } from "react";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { roles, users } from "@/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import type { PermissionKey } from "@/lib/permissions";
import { SYSTEM_ROLE_PERMISSIONS, ALL_PERMISSIONS } from "@/lib/permissions";
import { cachedRole } from "./roleCache";
import { roleGrants } from "./grants";

// A single dashboard render calls into rbac many times (layout + page each do requireOrg/isSuperAdmin/
// hasPermission). Memoize per request so the session decode and each DB round-trip (role, suspension)
// happen once, not 3-7x — every saved round-trip matters against a remote self-hosted droplet DB.
const getSession = cache(async () => getServerSession(authOptions));

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

// The tenant boundary. Returns the caller's org + identity; every tenant-scoped service
// takes organizationId from HERE, never from user input — this is the centralized scoping point.
//
// Super-admin impersonation: when a platform super-admin has an active "impersonate_org" cookie,
// requireOrg returns THAT org, so the super-admin operates inside the tenant through the normal UI.
export const requireOrg = cache(async function requireOrg() {
  const session = await requireAuth();
  let organizationId = session.user.organizationId;
  let readOnly = false;

  if (session.user.isSuperAdmin) {
    const orgId = await getImpersonatedOrgId();
    if (orgId) {
      organizationId = orgId;
      readOnly = await isImpersonatingReadOnly();
    }
  }

  if (!organizationId) {
    if (session.user.isSuperAdmin) {
      return { userId: session.user.id, organizationId: "", roleId: session.user.roleId, readOnly: false };
    }
    redirect("/login");
  }

  // Instant suspension: a suspended org is locked out immediately (even with a live session).
  // Super-admins are exempt so they can still inspect/impersonate a suspended tenant.
  if (!session.user.isSuperAdmin) {
    const { OrgService } = await import("@/domains/organizations/service");
    if (await OrgService.isSuspended(organizationId)) redirect("/suspended");
  }

  return { userId: session.user.id, organizationId, roleId: session.user.roleId, readOnly };
});

const IMPERSONATE_COOKIE = "impersonate_org";
const IMPERSONATE_READONLY_COOKIE = "impersonate_readonly";

export async function isImpersonatingReadOnly(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.isSuperAdmin) return false;
  const { cookies } = await import("next/headers");
  return (await cookies()).get(IMPERSONATE_READONLY_COOKIE)?.value === "true";
}

// The org a super-admin is currently impersonating (null if none / not a super-admin).
export async function getImpersonatedOrgId(): Promise<string | null> {
  const session = await getSession();
  if (!session?.user?.isSuperAdmin) return null;
  const { cookies } = await import("next/headers");
  return (await cookies()).get(IMPERSONATE_COOKIE)?.value ?? null;
}

// Platform operator gate. Throws "Forbidden" unless the caller is a super-admin.
// Also requires the MFA step-up (lib/auth/adminMfa): a password/session alone never operates the platform.
export async function requireSuperAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new Error("Forbidden");
  const { hasAdminMfa } = await import("@/lib/auth/adminMfa");
  if (!(await hasAdminMfa(session.user.id))) throw new Error("Forbidden: two-factor verification required");
  return session;
}

// Super-admin AND step-up done — for the /admin pages (which show the verification screen otherwise).
export async function isSuperAdminVerified(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.isSuperAdmin) return false;
  const { hasAdminMfa } = await import("@/lib/auth/adminMfa");
  return hasAdminMfa(session.user.id);
}

export async function isSuperAdmin(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session?.user?.isSuperAdmin);
}

// Resolve the current user's role (name + permissions + tenant) from the roleId carried in the JWT.
// Cached per request, and briefly in memory (lib/rbac/roleCache — cleared on role edits).
const currentRole = cache(async function currentRole(): Promise<{ name: string; permissions: string[]; organizationId: string | null } | null> {
  const session = await getSession();
  let roleId = session?.user?.roleId;

  // If session has no roleId, check user row in DB to avoid false-negative redirects on fresh sessions
  if (!roleId && session?.user?.id) {
    const [u] = await db
      .select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (u?.roleId) roleId = u.roleId;
  }

  // No role → least privilege (the shared system 'member' role), never admin. Owners always get the
  // admin role at signup, and roleless users were backfilled (migration 0071), so nobody is locked out.
  if (!roleId) {
    const [member] = await db
      .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
      .from(roles)
      .where(and(eq(roles.name, "member"), isNull(roles.organizationId)))
      .limit(1);
    if (member) return { name: member.name, permissions: member.permissions ?? [], organizationId: null };
    return null;
  }

  // Shared short-TTL cache that role edits clear immediately (forgetRole) — the same one the /api/v1
  // path uses. The old private 60s map here was never cleared, so web permission changes lagged.
  const cached = await cachedRole(roleId, async () => {
    const [role] = await db
      .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    return role ?? null;
  });
  const res = cached ? { name: cached.name, permissions: cached.permissions ?? [], organizationId: cached.organizationId } : null;
  // Defense in depth: a tenant role only counts inside its own org (writes already enforce this).
  if (res?.organizationId && res.organizationId !== session?.user?.organizationId && !session?.user?.isSuperAdmin) return null;
  return res;
});

export async function currentRoleName(): Promise<string | null> {
  return (await currentRole())?.name ?? null;
}

// admin implicitly has every permission; other roles must list the key explicitly.
export async function hasPermission(key: PermissionKey): Promise<boolean> {
  // Platform super-admins hold every permission (incl. inside an impersonated tenant),
  // unless operating under read-only impersonation where non-.view keys are refused.
  const session = await getSession();
  if (session?.user?.isSuperAdmin) {
    if (await isImpersonatingReadOnly()) {
      return key.endsWith(".view");
    }
    return true;
  }
  const role = await currentRole();
  if (!role) return false;
  return roleGrants(role, key);
}

// Session-free variant for the /api/v1 bearer-token surface: a mobile JWT carries a roleId
// directly (no next-auth session exists to read). A plain API key has no roleId at all — pass
// null and it is refused for every permission key, since a bare API key is not tied to any role's
// permission set.
export async function hasPermissionForRoleId(roleId: string | null, key: PermissionKey): Promise<boolean> {
  if (!roleId) return false;
  const role = await cachedRole(roleId, async () => {
    const [r] = await db
      .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    return r ?? null;
  });
  if (!role) return false;
  return roleGrants({ name: role.name, permissions: role.permissions ?? [], organizationId: role.organizationId }, key);
}

// Write chokepoint for mutations that gate on requireOrg() alone (not through requirePermission,
// which already refuses non-.view keys under read-only impersonation). Refuses when a super-admin
// is operating in READ-ONLY impersonation, so no write path can alter tenant data in that mode.
// A drop-in for requireOrg() in mutating actions: identical return, identical for every normal user.
// Platform maintenance blocks changes by everyone except super-admins (who are finishing the work).
async function assertNotInMaintenance() {
  const session = await getSession();
  if (session?.user?.isSuperAdmin) return;
  const { maintenanceMessage } = await import("@/lib/maintenance");
  const msg = await maintenanceMessage();
  if (msg) throw new Error(msg);
}

export async function assertWritable() {
  const ctx = await requireOrg();
  await assertNotInMaintenance();
  if (ctx.readOnly) {
    throw new Error("This is a read-only session. Exit read-only impersonation to make changes.");
  }
  return ctx;
}

// Everything a role grants, as permission keys (system admin / "*" → all).
function grantedKeys(role: { name: string; permissions: string[]; organizationId: string | null }): PermissionKey[] {
  return ALL_PERMISSIONS.filter((k) => roleGrants(role, k));
}

// Every permission a role id grants (for clients that hide actions the user can't take).
export async function permissionsForRoleId(roleId: string | null): Promise<PermissionKey[]> {
  if (!roleId) return [];
  // Through the 15s role cache (forgotten the moment a role is edited) — /me and the lead screens
  // resolve this on every open; it was the one uncached roles query in the chain.
  const role = await cachedRole(roleId, async () => {
    const [row] = await db
      .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    return row ?? null;
  });
  return role ? grantedKeys({ ...role, permissions: role.permissions ?? [] }) : [];
}

// Can the caller give `roleId` to someone? The role must be a system role or one of this org's own,
// and — unless the caller can manage roles — it may not grant anything the caller doesn't hold, so
// users.manage alone can't mint admins. Returns an error message, or null when allowed.
export async function roleAssignmentError(organizationId: string, roleId: string): Promise<string | null> {
  const [role] = await db
    .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
    .from(roles)
    .where(and(eq(roles.id, roleId), or(isNull(roles.organizationId), eq(roles.organizationId, organizationId))))
    .limit(1);
  if (!role) return "That role doesn't exist. Refresh the page and pick another.";
  if (await hasPermission("roles.manage")) return null;
  for (const key of grantedKeys({ ...role, permissions: role.permissions ?? [] })) {
    if (!(await hasPermission(key))) return "You can't give someone a role with more access than you have.";
  }
  return null;
}

// May the caller deactivate / delete / re-role this person? Not when the target's role grants something the
// caller doesn't hold (unless the caller can manage roles): otherwise users.manage alone could lock out or
// demote the workspace admins. Returns an error message, or null when allowed.
export async function targetUserError(organizationId: string, targetUserId: string): Promise<string | null> {
  if (await hasPermission("roles.manage")) return null;
  const [t] = await db
    .select({ roleId: users.roleId })
    .from(users)
    .where(and(eq(users.id, targetUserId), eq(users.organizationId, organizationId)))
    .limit(1);
  if (!t?.roleId) return null;
  const keys = await permissionsForRoleId(t.roleId);
  for (const key of keys) {
    if (!(await hasPermission(key))) return "You can't change someone who has more access than you do.";
  }
  return null;
}

// Message to show when the caller's email isn't verified yet (null = fine). Actions return it as FORBIDDEN.
export async function emailVerifiedError(): Promise<string | null> {
  const session = await getSession();
  if (!session?.user?.id || session.user.isSuperAdmin) return null;
  const { emailGate } = await import("@/lib/auth/emailVerify");
  return emailGate(session.user.id);
}

// Sensitive actions (outbound messages, exports, API keys, inviting people) need a proven email address.
export async function assertEmailVerified() {
  const session = await getSession();
  if (!session?.user?.id || session.user.isSuperAdmin) return;
  const { emailGate } = await import("@/lib/auth/emailVerify");
  const why = await emailGate(session.user.id);
  if (why) throw new Error(why);
}

// Throws "Forbidden" unless the caller holds the permission; returns the tenant scope on success.
export async function requirePermission(key: PermissionKey) {
  const { organizationId, userId } = await requireOrg();
  if (!(await hasPermission(key))) throw new Error("Forbidden");
  if (!key.endsWith(".view")) await assertNotInMaintenance();
  return { organizationId, userId };
}

// Throws "Forbidden" unless the signed-in user holds one of the allowed roles.
export async function requireRole(allowed: string[]) {
  const session = await requireAuth();
  const name = await currentRoleName();
  if (!name || !allowed.includes(name)) {
    throw new Error("Forbidden");
  }
  return session;
}

export function requireAdmin() {
  return requireRole(["admin"]);
}

export async function isAdmin(): Promise<boolean> {
  return (await currentRoleName()) === "admin";
}
