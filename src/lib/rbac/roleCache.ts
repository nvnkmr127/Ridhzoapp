// A lead open on the phone checks the same role 2–4 times across its requests (access, admin fields,
// profile). Roles change rarely: keep each one for a few seconds, and drop it the moment it's edited
// (RoleService / OrgService call forgetRole), so a permission change still applies right away here.
// Another server instance picks it up within TTL_MS.
const TTL_MS = 15_000;

export type CachedRole = { name: string; permissions: string[] | null; organizationId: string | null };
const cache = new Map<string, { role: CachedRole | null; exp: number }>();

export async function cachedRole(roleId: string, load: () => Promise<CachedRole | null>): Promise<CachedRole | null> {
  const hit = cache.get(roleId);
  if (hit && hit.exp > Date.now()) return hit.role;
  const role = await load();
  cache.set(roleId, { role, exp: Date.now() + TTL_MS });
  return role;
}

export function forgetRole(roleId?: string) {
  if (roleId) cache.delete(roleId);
  else cache.clear();
}
