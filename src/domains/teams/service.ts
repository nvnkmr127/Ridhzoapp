import { db } from "@/db";
import { UserFacingError } from "@/lib/actions/result";
import { teams, users, leads, assignmentRules } from "@/db/schema";
import { and, count, eq, ne, sql } from "drizzle-orm";

// Team names are unique per org, ignoring case and surrounding spaces (also enforced by a DB index).
async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const [clash] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(
      eq(teams.organizationId, organizationId),
      sql`lower(${teams.name}) = lower(${name})`,
      exceptId ? ne(teams.id, exceptId) : undefined,
    ))
    .limit(1);
  if (clash) throw new UserFacingError(`A team called "${name}" already exists.`);
}

export class TeamService {
  static async list(organizationId: string) {
    return db.select().from(teams).where(eq(teams.organizationId, organizationId)).orderBy(teams.name);
  }

  static async create(organizationId: string, name: string) {
    await assertNameFree(organizationId, name);
    const [t] = await db.insert(teams).values({ organizationId, name }).returning();
    return t;
  }

  static async rename(organizationId: string, id: string, name: string) {
    await assertNameFree(organizationId, name, id);
    const [t] = await db
      .update(teams)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(teams.id, id), eq(teams.organizationId, organizationId)))
      .returning();
    return t;
  }

  // Members and leads are detached (kept, just team-less). Refused while a source's automatic
  // assignment rotates through this team, since deleting it would silently stop that assignment.
  static async remove(organizationId: string, id: string) {
    const [t] = await db.select({ id: teams.id, name: teams.name }).from(teams).where(and(eq(teams.id, id), eq(teams.organizationId, organizationId))).limit(1);
    if (!t) return undefined;
    const [{ n }] = await db.select({ n: count() }).from(assignmentRules).where(eq(assignmentRules.teamId, id));
    if (Number(n) > 0) throw new UserFacingError("This team is used for automatic lead assignment on a lead source. Change that source's assignment first.");
    await db.transaction(async (tx) => {
      await tx.update(users).set({ teamId: null, updatedAt: new Date() }).where(and(eq(users.teamId, id), eq(users.organizationId, organizationId)));
      await tx.update(leads).set({ teamId: null }).where(and(eq(leads.teamId, id), eq(leads.organizationId, organizationId)));
      await tx.delete(teams).where(and(eq(teams.id, id), eq(teams.organizationId, organizationId)));
    });
    return t;
  }
}
