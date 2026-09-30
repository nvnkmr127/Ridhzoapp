import type { PermissionKey } from "@/lib/permissions";
import { SYSTEM_ROLE_PERMISSIONS } from "@/lib/permissions";

// Pure (no session, no DB) so workers and mailers can use the exact same rule as request handlers.
// Shared grant logic: does this role (by name/permissions/org) hold `key`? Factored out so both
// the session-based hasPermission() below and the token-based checkRolePermission() (used by the
// /api/v1 bearer-token routes, which have no next-auth session to read) apply the same rules.
export function roleGrants(role: { name: string; permissions: string[]; organizationId: string | null }, key: PermissionKey): boolean {
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
  // Only for the shared roles (org-less): a tenant-owned role that merely reuses the name "admin" or
  // "member" must not inherit their defaults.
  const systemDefaults = role.organizationId === null ? SYSTEM_ROLE_PERMISSIONS[role.name.toLowerCase()] : undefined;
  return systemDefaults ? systemDefaults.includes(key) : false;
}

