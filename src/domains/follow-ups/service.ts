import { db } from "@/db";
import { followUps, users, reminders } from "@/db/schema";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { eventBus } from "@/lib/events/emitter";
import { orgLeadIds, assertLeadInOrg } from "@/domains/leads/ownership";
import { syncLeadFollowUpState, markLeadContacted } from "@/domains/follow-ups/state";
import { normalizeFollowUpType, CONTACT_TYPES } from "@/lib/followUps/types";
import { UserFacingError } from "@/lib/actions/result";

// Scope a follow-up id to a tenant via its lead. organizationId omitted = trusted internal caller.
function scopeById(id: string, organizationId?: string): SQL | undefined {
  return organizationId
    ? and(eq(followUps.id, id), inArray(followUps.leadId, orgLeadIds(organizationId)))
    : eq(followUps.id, id);
}
// Only a pending follow-up can be completed, cancelled, snoozed or rescheduled — so a second tab or an
// API retry can't re-complete one (re-firing automations) or revive a finished one.
const pendingById = (id: string, organizationId?: string) => and(scopeById(id, organizationId), eq(followUps.status, "pending"));

function assertValidDate(d: Date) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new UserFacingError("That date is invalid. Please pick a valid date and time.");
}

// An assignee must be an active member of the lead's workspace (reminders go to them).
async function assertAssignable(userId: string, organizationId: string) {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt)))
    .limit(1);
  if (!u) throw new UserFacingError("That person isn't an active member of this workspace.");
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
    assertValidDate(input.dueAt);
    if (input.organizationId) {
      await assertLeadInOrg(input.leadId, input.organizationId);
      if (input.userId) await assertAssignable(input.userId, input.organizationId);
    }
    const [followUp] = await db.insert(followUps).values({
      leadId: input.leadId,
      type: normalizeFollowUpType(input.type),
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

  // Edit title/notes/type and optionally the due time of a pending follow-up.
  static async updateFollowUp(
    id: string,
    input: { title: string; description?: string | null; type: string; dueAt: Date },
    organizationId?: string,
  ) {
    assertValidDate(input.dueAt);
    const [before] = await db.select({ dueAt: followUps.dueAt }).from(followUps).where(pendingById(id, organizationId)).limit(1);
    if (!before) return undefined;
    const moved = before.dueAt.getTime() !== input.dueAt.getTime();
    const [updated] = await db.update(followUps)
      .set({
        title: input.title,
        description: input.description || null,
        type: normalizeFollowUpType(input.type),
        dueAt: input.dueAt,
        ...(moved ? { snoozedUntil: null, overdueNotifiedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(pendingById(id, organizationId))
      .returning();
    if (updated) {
      await syncLeadFollowUpState(updated.leadId);
      if (moved) this.emit('follow_up.rescheduled', updated);
    }
    return updated;
  }

  static async completeFollowUp(id: string, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(pendingById(id, organizationId))
      .returning();

    if (updated) {
      // Only an actual call/WhatsApp/email counts as contacting the lead; a task is work, not contact.
      if (CONTACT_TYPES.has(normalizeFollowUpType(updated.type))) {
        await markLeadContacted(updated.leadId, updated.completedAt ?? new Date());
      }
      await syncLeadFollowUpState(updated.leadId);
      this.emit(normalizeFollowUpType(updated.type) === 'task' ? 'task.completed' : 'follow_up.completed', updated);
    }

    return updated;
  }

  // Undo a completion (lead tab "mark as not done"). Doesn't un-record the contact.
  static async reopenFollowUp(id: string, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({ status: "pending", completedAt: null, updatedAt: new Date() })
      .where(and(scopeById(id, organizationId), eq(followUps.status, "completed")))
      .returning();
    if (updated) await syncLeadFollowUpState(updated.leadId);
    return updated;
  }

  static async cancelFollowUp(id: string, organizationId?: string) {
    const [updated] = await db.update(followUps)
      .set({
        status: "cancelled",
        updatedAt: new Date()
      })
      .where(pendingById(id, organizationId))
      .returning();

    if (updated) await syncLeadFollowUpState(updated.leadId);
    return updated;
  }

  static async snoozeFollowUp(id: string, snoozedUntil: Date, organizationId?: string) {
    assertValidDate(snoozedUntil);
    // Snooze pushes the due date forward — otherwise the follow-up stays at its old due_at and keeps
    // showing as overdue in every list that groups by due_at. snoozed_until is kept for the record.
    const [updated] = await db.update(followUps)
      .set({
        dueAt: snoozedUntil,
        snoozedUntil,
        overdueNotifiedAt: null, // a new due time can go overdue (and alert) again
        updatedAt: new Date()
      })
      .where(pendingById(id, organizationId))
      .returning();

    if (updated) await syncLeadFollowUpState(updated.leadId);
    return updated;
  }

  static async rescheduleFollowUp(id: string, dueAt: Date, organizationId?: string) {
    assertValidDate(dueAt);
    const [updated] = await db.update(followUps)
      .set({
        dueAt,
        snoozedUntil: null, // clear snooze on reschedule
        overdueNotifiedAt: null,
        updatedAt: new Date()
      })
      .where(pendingById(id, organizationId))
      .returning();

    if (updated) {
      await syncLeadFollowUpState(updated.leadId);
      this.emit('follow_up.rescheduled', updated);
    }

    return updated;
  }

  static async assignFollowUp(id: string, userId: string | null, organizationId: string) {
    if (userId) await assertAssignable(userId, organizationId);
    const [updated] = await db.update(followUps)
      .set({
        userId,
        updatedAt: new Date()
      })
      .where(pendingById(id, organizationId))
      .returning();

    return updated;
  }

  // Remove a follow-up for good (internal cleanup only — the UI cancels instead, keeping history).
  // Its sent-reminder rows go first: reminders.follow_up_id has no ON DELETE.
  static async deleteFollowUp(id: string, organizationId?: string) {
    const [row] = await db.select({ id: followUps.id, leadId: followUps.leadId }).from(followUps).where(scopeById(id, organizationId)).limit(1);
    if (!row) return undefined;
    await db.delete(reminders).where(eq(reminders.followUpId, id));
    await db.delete(followUps).where(eq(followUps.id, id));
    await syncLeadFollowUpState(row.leadId);
    return row;
  }

  private static emit(event: 'follow_up.completed' | 'task.completed' | 'follow_up.rescheduled', f: typeof followUps.$inferSelect) {
    eventBus.emit(event, {
      leadId: f.leadId,
      userId: f.userId || undefined,
      followUpId: f.id,
      type: f.type,
      title: f.title,
    });
  }
}
