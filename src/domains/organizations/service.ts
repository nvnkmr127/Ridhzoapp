import { db } from "@/db";
import { forgetRole } from "@/lib/rbac/roleCache";
import { signupTrial } from "@/domains/billing/planService";
import { organizations, users, roles } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SYSTEM_ROLE_PERMISSIONS } from "@/lib/permissions";

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

export class OrgService {
  // The two shared system roles live once with organizationId = null. Idempotent: creates them
  // if missing (keeping admin's permission list current), returns the admin role.
  static async ensureSystemRoles() {
    for (const name of ["admin", "member"] as const) {
      const [existing] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.name, name), isNull(roles.organizationId)))
        .limit(1);
      const permissions = SYSTEM_ROLE_PERMISSIONS[name] ?? [];
      if (!existing) {
        await db.insert(roles).values({ name, organizationId: null, permissions });
      } else if (name === "admin") {
        await db.update(roles).set({ permissions }).where(eq(roles.id, existing.id));
        forgetRole(existing.id);
      }
    }
    const [adminRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.name, "admin"), isNull(roles.organizationId)))
      .limit(1);
    return adminRole;
  }

  // Self-serve signup: create the org and its first user as owner (admin role), in one go.
  static async createWithOwner(input: {
    orgName: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const adminRole = await OrgService.ensureSystemRoles();
    const slug = `${slugify(input.orgName)}-${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await bcrypt.hash(input.password, 10);

    let firstName = input.firstName?.trim() || undefined;
    let lastName = input.lastName?.trim() || undefined;
    if (firstName && !lastName) {
      const parts = firstName.split(/\s+/);
      if (parts.length > 1) {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
    }

    return db.transaction(async (tx) => {
      const email = input.email.trim().toLowerCase();
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw new Error("An account with that email already exists");

      const [org] = await tx.insert(organizations).values({ name: input.orgName, slug, ...signupTrial() }).returning();

      await tx.insert(users).values({
        organizationId: org.id,
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        roleId: adminRole?.id ?? null,
        isActive: true,
      });

      return { organizationId: org.id, slug };
    });
  }

  private static suspendedCache = new Map<string, { val: boolean; exp: number }>();

  // Cheap suspension check for the request path (single indexed PK lookup with 60s in-memory cache).
  static async isSuspended(organizationId: string): Promise<boolean> {
    const now = Date.now();
    const cached = OrgService.suspendedCache.get(organizationId);
    if (cached && cached.exp > now) return cached.val;

    const [o] = await db
      .select({ s: organizations.suspendedAt })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    const val = !!o?.s;
    OrgService.suspendedCache.set(organizationId, { val, exp: now + 60_000 });
    return val;
  }

  static async getOrganization(organizationId: string) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return org;
  }

  static async updateOrganization(
    organizationId: string,
    data: Partial<{
      name: string;
      timezone: string;
      locale: string;
      currency: string;
      dateFormat: string;
      industry: string | null;
      aiContext: string | null;
      phone: string | null;
      website: string | null;
      addressLine1: string | null;
      city: string | null;
      country: string | null;
      requiredLeadFields: string[];
      slaHours: number | null;
      whatsappMode: string;
      autoMergeDuplicates: number;
      sequenceWindowStart: number | null;
      sequenceWindowEnd: number | null;
      dailySummary: number;
      workDays: number[];
      workStartHour: number;
      workEndHour: number;
    }>,
    expectedUpdatedAt?: Date,
  ) {
    // Optimistic concurrency: when the caller passes the updatedAt it loaded, only write if the row
    // hasn't changed since — so a second admin's stale form save is rejected, not silently applied
    // over a fresh change. Always bump updatedAt so the next reader sees a new version.
    const where = expectedUpdatedAt
      ? and(
          eq(organizations.id, organizationId),
          sql`date_trunc('second', ${organizations.updatedAt}) <= date_trunc('second', ${expectedUpdatedAt.toISOString()}::timestamp)`,
        )
      : eq(organizations.id, organizationId);
    const [updated] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(where)
      .returning();
    if (!updated && expectedUpdatedAt) {
      const err = new Error("These settings were changed by someone else. Reload and try again.");
      (err as { code?: string }).code = "CONFLICT";
      throw err;
    }
    return updated;
  }
}

