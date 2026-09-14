import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PermissionKey } from "@/lib/permissions";
import { SYSTEM_ROLE_PERMISSIONS } from "@/lib/permissions";

export async function requireAuth() {
  const session = await getServerSession(authOptions);
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
export async function requireOrg() {
  const session = await requireAuth();
  let organizationId = session.user.organizationId;

  if (session.user.isSuperAdmin) {
    const orgId = await getImpersonatedOrgId();
    if (orgId) organizationId = orgId;
  }

  if (!organizationId) {
    redirect("/login");
  }

  // Instant suspension: a suspended org is locked out immediately (even with a live session).
  // Super-admins are exempt so they can still inspect/impersonate a suspended tenant.
  if (!session.user.isSuperAdmin) {
    const { OrgService } = await import("@/domains/organizations/service");
    if (await OrgService.isSuspended(organizationId)) redirect("/suspended");
  }

  return { userId: session.user.id, organizationId, roleId: session.user.roleId };
}

const IMPERSONATE_COOKIE = "impersonate_org";

// The org a super-admin is currently impersonating (null if none / not a super-admin).
export async function getImpersonatedOrgId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
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
  const session = await getServerSession(authOptions);
  return Boolean(session?.user?.isSuperAdmin);
}

// Resolve the current user's role (name + permissions) from the roleId carried in the JWT.
async function currentRole(): Promise<{ name: string; permissions: string[] } | null> {
  const session = await getServerSession(authOptions);
  const roleId = session?.user?.roleId;
  if (!roleId) return null;
  const [role] = await db
    .select({ name: roles.name, permissions: roles.permissions })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  return role ? { name: role.name, permissions: role.permissions ?? [] } : null;
}

export async function currentRoleName(): Promise<string | null> {
  return (await currentRole())?.name ?? null;
}

// admin implicitly has every permission; other roles must list the key explicitly.
export async function hasPermission(key: PermissionKey): Promise<boolean> {
  // Platform super-admins hold every permission (incl. inside an impersonated tenant).
  const session = await getServerSession(authOptions);
  if (session?.user?.isSuperAdmin) return true;
  const role = await currentRole();
  if (!role) return false;
  // Admin (any casing) and the "*" wildcard grant every permission — as the seed intends.
  if (role.name.toLowerCase() === "admin" || role.permissions.includes("*") || role.permissions.includes(key)) {
    return true;
  }
  // Shared system roles (member/admin, org-less) derive their baseline from code, so a stored
  // `member` row with an empty permissions array still gets its defaults (e.g. leads.edit) without
  // a data migration. Custom roles are unaffected (their name isn't in the map).
  const systemDefaults = SYSTEM_ROLE_PERMISSIONS[role.name.toLowerCase()];
  return systemDefaults ? systemDefaults.includes(key) : false;
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
