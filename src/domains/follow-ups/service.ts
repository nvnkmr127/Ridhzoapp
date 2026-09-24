import { db } from "@/db";
import { followUps } from "@/db/schema";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { orgLeadIds, assertLeadInOrg } from "@/domains/leads/ownership";
import { syncLeadFollowUpState, markLeadContacted } from "@/domains/follow-ups/state";

// Scope a follow-up id to a tenant via its lead. organizationId omitted = trusted internal caller.
function scopeById(id: string, organizationId?: string): SQL | undefined {
  return organizationId
    ? and(eq(followUps.id, id), inArray(followUps.leadId, orgLeadIds(organizationId)))
    : eq(followUps.id, id);
}

export class FollowUpService {
  static async createFollowUp(input: {
    leadId: string;
    type: string;
    title: string;
    description?: string;
    dueAt: Date;
    userId: string | null; // null = unassigned (e.g. a sequence step on an unowned lead)
    organizationId?: string;
  }) {
    if (input.organizationId) await assertLeadInOrg(input.leadId, input.organizationId);
    const [followUp] = await db.insert(followUps).values({
      leadId: input.leadId,
      type: input.type,
      title: input.title,
      description: input.description || null,
      dueAt: input.dueAt,
      userId: input.userId,
      status: "pending",
    }).returning();

    // Reminders are delivered by the periodic follow-up-due scan (src/lib/jobs/workers/followUpReminderWorker),
    // which reads live due_at/status/snooze — so a reschedule or completion never leaves a stale delayed job.
    await syncLeadFollowUpState(followUp.leadId);

    eventBus.emit('follow_up.scheduled', {
      leadId: followUp.leadId,
      userId: followUp.userId || undefined,
      followUpId: followUp.id,
      type: followUp.type,
      title: followUp.title,
    });

    return followUp;
  }

  static async completeFollowUp(id: string, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(scopeById(id, organizationId))
      .returning();

    if (updated) {
      // A completed follow-up is a contact and must drop out of the lead's "next follow-up".
      await markLeadContacted(updated.leadId, updated.completedAt ?? new Date());
      await syncLeadFollowUpState(updated.leadId);
      if (updated.type.toLowerCase() === 'task') {
        eventBus.emit('task.completed', {
          leadId: updated.leadId,
          userId: updated.userId || undefined,
          followUpId: updated.id,
          type: updated.type,
          title: updated.title,
        });
      } else {
        eventBus.emit('follow_up.completed', {
          leadId: updated.leadId,
          userId: updated.userId || undefined,
          followUpId: updated.id,
          type: updated.type,
          title: updated.title,
        });
      }
    }

    return updated;
  }

  static async cancelFollowUp(id: string, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({
        status: "cancelled",
        updatedAt: new Date()
      })
      .where(scopeById(id, organizationId))
      .returning();

    if (updated) await syncLeadFollowUpState(updated.leadId);
    return updated;
  }

  static async snoozeFollowUp(id: string, snoozedUntil: Date, organizationId?: string) {
    // Snooze pushes the due date forward — otherwise the follow-up stays at its old due_at and keeps
    // showing as overdue in every list that groups by due_at. snoozed_until is kept for the record.
    const [updated] = await db.update(followUps)
      .set({
        dueAt: snoozedUntil,
        snoozedUntil,
        status: "pending", // Reset to pending
        updatedAt: new Date()
      })
      .where(scopeById(id, organizationId))
      .returning();

    if (updated) await syncLeadFollowUpState(updated.leadId);
    return updated;
  }

  static async rescheduleFollowUp(id: string, dueAt: Date, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({
        dueAt,
        snoozedUntil: null, // clear snooze on reschedule
        updatedAt: new Date()
      })
      .where(scopeById(id, organizationId))
      .returning();

    if (updated) {
      await syncLeadFollowUpState(updated.leadId);
      eventBus.emit('follow_up.rescheduled', {
        leadId: updated.leadId,
        userId: updated.userId || undefined,
        followUpId: updated.id,
        type: updated.type,
        title: updated.title,
      });
    }

    return updated;
  }

  static async assignFollowUp(id: string, userId: string, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({
        userId,
        updatedAt: new Date()
      })
      .where(scopeById(id, organizationId))
      .returning();

    return updated;
  }
}
