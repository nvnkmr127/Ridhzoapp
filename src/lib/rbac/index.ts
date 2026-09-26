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
export async function requireSuperAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new Error("Forbidden");
  return session;
}

export async function isSuperAdmin(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session?.user?.isSuperAdmin);
}

const roleCache = new Map<string, { role: { name: string; permissions: string[]; organizationId: string | null } | null; exp: number }>();

// Resolve the current user's role (name + permissions + tenant) from the roleId carried in the JWT.
// Cached per request and in-memory (60s TTL) so role lookup doesn't block every page navigation.
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

  const now = Date.now();
  const cached = roleCache.get(roleId);
  let res = cached && cached.exp > now ? cached.role : undefined;
  if (res === undefined) {
    const [role] = await db
      .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    res = role ? { name: role.name, permissions: role.permissions ?? [], organizationId: role.organizationId } : null;
    roleCache.set(roleId, { role: res, exp: now + 60_000 });
  }
  // Defense in depth: a tenant role only counts inside its own org (writes already enforce this).
  if (res?.organizationId && res.organizationId !== session?.user?.organizationId && !session?.user?.isSuperAdmin) return null;
  return res;
});

export async function currentRoleName(): Promise<string | null> {
  return (await currentRole())?.name ?? null;
}

// Shared grant logic: does this role (by name/permissions/org) hold `key`? Factored out so both
// the session-based hasPermission() below and the token-based checkRolePermission() (used by the
// /api/v1 bearer-token routes, which have no next-auth session to read) apply the same rules.
function roleGrants(role: { name: string; permissions: string[]; organizationId: string | null }, key: PermissionKey): boolean {
  // The "*" wildcard grants every permission. The "admin" NAME only grants everything for the
  // shared SYSTEM admin role (organizationId === null) — a tenant-owned role named "admin" gets
  // only what its permissions array lists, so `roles.manage` can't be used to mint a full-power
  // role by naming it "admin" (privilege escalation).
  const isSystemAdmin = role.organizationId === null && role.name.toLowerCase() === "admin";
  if (isSystemAdmin || role.permissions.includes("*") || role.permissions.includes(key)) {
    return true;
  }
  // Shared system roles (member/admin, org-less) derive their baseline from code, so a stored
  // `member` row with an empty permissions array still gets its defaults (e.g. leads.edit) without
  // a data migration. Custom roles are unaffected (their name isn't in the map).
  const systemDefaults = SYSTEM_ROLE_PERMISSIONS[role.name.toLowerCase()];
  return systemDefaults ? systemDefaults.includes(key) : false;
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
export async function assertWritable() {
  const ctx = await requireOrg();
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
  const [role] = await db
    .select({ name: roles.name, permissions: roles.permissions, organizationId: roles.organizationId })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
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

// Throws "Forbidden" unless the caller holds the permission; returns the tenant scope on success.
export async function requirePermission(key: PermissionKey) {
  const { organizationId, userId } = await requireOrg();
  if (!(await hasPermission(key))) throw new Error("Forbidden");
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
