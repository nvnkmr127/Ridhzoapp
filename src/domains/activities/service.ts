import { db } from "@/db";
import { activities } from "@/db/schema/activities";
import { users } from "@/db/schema/users";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

/** How many activities the lead profile loads at a time (initial render and each "Load older"). */
export const LEAD_ACTIVITY_PAGE = 100;

export class ActivityService {
  // occurredAt: when it actually happened (a note about last week's call); defaults to now.
  static async addActivity(data: { leadId: string; userId?: string; type: string; content?: string; externalRef?: string; occurredAt?: Date }) {
    const [activity] = await db.insert(activities).values({
      leadId: data.leadId,
      userId: data.userId,
      type: data.type,
      content: data.content,
      externalRef: data.externalRef,
      ...(data.occurredAt ? { occurredAt: data.occurredAt } : {}),
    }).returning();
    return activity;
  }

  // Newest first. `before` pages further back (keyset on created_at, id) for "Load older".
  static async getLeadActivities(leadId: string, limit?: number, before?: { createdAt: Date; id: string }, types?: string[]) {
    const rows = await db
      .select({
        id: activities.id,
        leadId: activities.leadId,
        seq: activities.seq,
        userId: activities.userId,
        type: activities.type,
        content: activities.content,
        durationSec: activities.durationSec,
        externalRef: activities.externalRef,
        occurredAt: activities.occurredAt,
        createdAt: activities.createdAt,
        updatedAt: activities.updatedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(activities)
      .leftJoin(users, eq(activities.userId, users.id))
      .where(and(
        eq(activities.leadId, leadId),
        types?.length ? inArray(activities.type, types) : undefined,
        before ? sql`(${activities.createdAt}, ${activities.id}) < (${before.createdAt.toISOString().replace("Z", "")}::timestamp, ${before.id}::uuid)` : undefined,
      ))
      .orderBy(desc(activities.createdAt), desc(activities.id))
      .limit(limit ?? Number.MAX_SAFE_INTEGER);

    const assignRegex = /Lead was assigned to user ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    const mentionedUuids = new Set<string>();
    for (const r of rows) {
      if (r.content) {
        let match: RegExpExecArray | null;
        assignRegex.lastIndex = 0;
        while ((match = assignRegex.exec(r.content)) !== null) {
          if (match[1]) mentionedUuids.add(match[1]);
        }
      }
    }

    const userMap = new Map<string, string>();
    if (mentionedUuids.size > 0) {
      const foundUsers = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(inArray(users.id, Array.from(mentionedUuids)));
      for (const u of foundUsers) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
        userMap.set(u.id, name);
      }
    }

    return rows.map((r) => {
      let userName = "";
      if (r.firstName || r.lastName) {
        userName = [r.firstName, r.lastName].filter(Boolean).join(" ");
      } else if (r.email) {
        userName = r.email;
      }

      let content = r.content;
      if (content) {
        content = content.replace(/Lead was assigned to user ([0-9a-f-]{36})\.?/gi, (_, id) => {
          const name = userMap.get(id);
          return name ? `Lead was assigned to ${name}.` : `Lead was assigned.`;
        });
      }

      return {
        id: r.id,
        leadId: r.leadId,
        seq: r.seq,
        userId: r.userId,
        userName,
        type: r.type,
        content,
        durationSec: r.durationSec,
        externalRef: r.externalRef,
        occurredAt: r.occurredAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
  }

  static async deleteActivity(activityId: string, leadId: string) {
    const [deleted] = await db
      .delete(activities)
      .where(and(eq(activities.id, activityId), eq(activities.leadId, leadId)))
      .returning();
    return deleted;
  }

  static async updateActivity(activityId: string, leadId: string, content: string) {
    const [updated] = await db
      .update(activities)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(activities.id, activityId), eq(activities.leadId, leadId)))
      .returning();
    return updated;
  }
}
