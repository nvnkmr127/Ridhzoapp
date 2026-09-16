import { db } from "@/db";
import { organizations, users, leads } from "@/db/schema";
import { count, desc, eq, isNull } from "drizzle-orm";

// Cross-tenant operations for the platform super-admin. NOT org-scoped by design — every caller
// must be gated by requireSuperAdmin() first.
export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planStatus: string;
  suspended: boolean;
  userCount: number;
  leadCount: number;
  createdAt: string;
}

export class PlatformService {
  static async listOrganizations(): Promise<OrgSummary[]> {
    const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
    const userCounts = await db
      .select({ orgId: users.organizationId, c: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.organizationId);
    const leadCounts = await db
      .select({ orgId: leads.organizationId, c: count() })
      .from(leads)
      .where(isNull(leads.deletedAt))
      .groupBy(leads.organizationId);

    const u = new Map(userCounts.map((r) => [r.orgId, Number(r.c)]));
    const l = new Map(leadCounts.map((r) => [r.orgId, Number(r.c)]));

    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan ?? "free",
      planStatus: o.planStatus ?? "active",
      suspended: !!o.suspendedAt,
      userCount: u.get(o.id) ?? 0,
      leadCount: l.get(o.id) ?? 0,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async setPlan(organizationId: string, plan: string) {
    const [row] = await db
      .update(organizations)
      .set({ plan, planStatus: "active", updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning({ id: organizations.id });
    return row ?? null;
  }

  static async setSuspended(organizationId: string, suspended: boolean) {
    const [row] = await db
      .update(organizations)
      .set({ suspendedAt: suspended ? new Date() : null })
      .where(eq(organizations.id, organizationId))
      .returning({ id: organizations.id });
    return row ?? null;
  }

  static async getOrg(organizationId: string) {
    const [row] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return row ?? null;
  }
}
