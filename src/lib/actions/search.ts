"use server";

import { requireOrg, isSuperAdmin } from "@/lib/rbac";
import { db } from "@/db";
import { leads, users, roles } from "@/db/schema";
import { and, eq, or, ilike, desc, isNull, sql } from "drizzle-orm";
import { PlatformService, type FoundOrg } from "@/domains/platform/service";

export type SearchLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export type SearchUser = {
  id: string;
  name: string;
  email: string;
  roleName: string | null;
};

export type UniversalSearchResults = {
  leads: SearchLead[];
  users: SearchUser[];
  organizations?: FoundOrg[];
};

// Org-scoped universal search for the command palette. Matches leads and team members,
// plus cross-tenant organizations when called by a platform super-admin.
export async function searchUniversalAction(query: string): Promise<UniversalSearchResults> {
  const { userId, organizationId } = await requireOrg();
  const q = query.trim();
  if (q.length < 2) return { leads: [], users: [] };
  const like = `%${q}%`;
  const [isSuper, { hasPermission }] = await Promise.all([
    isSuperAdmin(),
    import("@/lib/rbac"),
  ]);
  const isAdmin = await hasPermission("settings.manage");

  const [leadRows, userRows, orgRows] = await Promise.all([
    organizationId
      ? db
          .select({ id: leads.id, name: leads.name, email: leads.email, phone: leads.phone, company: leads.company })
          .from(leads)
          .where(and(
            eq(leads.organizationId, organizationId),
            isNull(leads.deletedAt),
            ...(!isAdmin && userId ? [eq(leads.ownerId, userId)] : []),
            or(ilike(leads.name, like), ilike(leads.email, like), ilike(leads.phone, like), ilike(leads.company, like)),
          ))
          .orderBy(desc(leads.createdAt))
          .limit(10)
      : Promise.resolve([]),

    organizationId
      ? db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            roleName: roles.name,
          })
          .from(users)
          .leftJoin(roles, eq(users.roleId, roles.id))
          .where(and(
            eq(users.organizationId, organizationId),
            isNull(users.deletedAt),
            or(
              ilike(users.email, like),
              ilike(users.firstName, like),
              ilike(users.lastName, like),
              ilike(sql<string>`concat_ws(' ', ${users.firstName}, ${users.lastName})`, like),
            ),
          ))
          .limit(5)
      : Promise.resolve([]),

    isSuper ? PlatformService.findOrg(q, 6) : Promise.resolve([]),
  ]);

  return {
    leads: leadRows,
    users: userRows.map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      email: u.email,
      roleName: u.roleName,
    })),
    organizations: orgRows,
  };
}

// Org-scoped lead search kept for backward compatibility.
export async function searchLeadsAction(query: string) {
  const res = await searchUniversalAction(query);
  return res.leads;
}
