import { db } from "@/db";
import { activities } from "@/db/schema/activities";
import { users } from "@/db/schema/users";
import { eq, and, desc, inArray } from "drizzle-orm";

export class ActivityService {
  static async addActivity(data: { leadId: string; userId?: string; type: string; content?: string }) {
    const [activity] = await db.insert(activities).values({
      leadId: data.leadId,
      userId: data.userId,
      type: data.type,
      content: data.content,
    }).returning();
    return activity;
  }

  static async getLeadActivities(leadId: string) {
    const rows = await db
      .select({
        id: activities.id,
        leadId: activities.leadId,
        userId: activities.userId,
        type: activities.type,
        content: activities.content,
        occurredAt: activities.occurredAt,
        createdAt: activities.createdAt,
        updatedAt: activities.updatedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(activities)
      .leftJoin(users, eq(activities.userId, users.id))
      .where(eq(activities.leadId, leadId))
      .orderBy(desc(activities.createdAt));

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
        userId: r.userId,
        userName,
        type: r.type,
        content,
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
