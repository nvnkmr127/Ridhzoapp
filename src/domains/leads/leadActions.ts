import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { followUps, leadPipelineStages, leads } from "@/db/schema";
import { ActivityService } from "@/domains/activities/service";
import { markLeadContacted, syncLeadFollowUpState } from "@/domains/follow-ups/state";
import { escapeHtml } from "@/lib/utils";

// Lead changes shared by the web server actions and the mobile API. Callers check access first.

class LeadActionError extends Error {
  code = "VALIDATION" as const;
}

// Quick-set follow-ups ("Follow-up" button) are their own type, so setting one never moves a
// sequence task or manual reminder; clearing cancels only these.
export const QUICK_FOLLOW_UP_TYPE = "followup";

// Set (or clear with null) the lead's next follow-up, mirrored as one pending "followup" task so it
// shows in Follow-ups lists and the calendar.
export async function setLeadNextFollowUp(leadId: string, date: Date | null, userId: string, organizationId: string) {
  if (date && Number.isNaN(date.getTime())) throw new LeadActionError("That follow-up date is invalid. Please pick a valid date and time.");
  const [updated] = await db
    .update(leads)
    .set({ nextFollowUpAt: date, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .returning();
  if (!updated) return null;

  if (date) {
    const [existing] = await db
      .select()
      .from(followUps)
      .where(and(eq(followUps.leadId, leadId), eq(followUps.status, "pending"), eq(followUps.type, QUICK_FOLLOW_UP_TYPE)))
      .orderBy(desc(followUps.createdAt))
      .limit(1);
    const title = `Follow-up with ${updated.name || "lead"}`;
    if (existing) {
      await db.update(followUps).set({ dueAt: date, title, overdueNotifiedAt: null, updatedAt: new Date() }).where(eq(followUps.id, existing.id));
    } else {
      await db.insert(followUps).values({ leadId, userId: updated.ownerId || userId, type: QUICK_FOLLOW_UP_TYPE, title, status: "pending", dueAt: date });
    }
  } else {
    await db
      .update(followUps)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(followUps.leadId, leadId), eq(followUps.status, "pending"), eq(followUps.type, QUICK_FOLLOW_UP_TYPE)));
  }
  // Normalize next_follow_up_at to the soonest pending follow-up (not just the date picked).
  await syncLeadFollowUpState(leadId);
  return updated;
}

// Pipeline stage and opportunity value. undefined = leave as is, "" / null = clear.
export async function updateLeadStageAndValue(
  leadId: string,
  input: { stageId?: string | null; expectedValue?: string | null },
  userId: string,
  organizationId: string,
) {
  if (input.expectedValue) {
    const n = Number(input.expectedValue);
    if (Number.isNaN(n)) throw new LeadActionError("Opportunity value must be a number.");
    if (n < 0) throw new LeadActionError("Opportunity value cannot be negative.");
  }
  if (input.stageId) {
    const [stage] = await db
      .select({ id: leadPipelineStages.id })
      .from(leadPipelineStages)
      .where(and(eq(leadPipelineStages.id, input.stageId), eq(leadPipelineStages.organizationId, organizationId)))
      .limit(1);
    if (!stage) throw new LeadActionError("That pipeline stage doesn't exist in this workspace.");
  }
  const [before] = await db
    .select({ stageId: leads.stageId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .limit(1);
  const [updated] = await db
    .update(leads)
    .set({
      ...(input.stageId !== undefined ? { stageId: input.stageId || null } : {}),
      ...(input.expectedValue !== undefined ? { expectedValue: input.expectedValue || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .returning();
  if (updated && input.stageId !== undefined && (before?.stageId ?? null) !== (updated.stageId ?? null)) {
    const { eventBus } = await import("@/lib/events/emitter");
    eventBus.emit("lead.stage_changed", { leadId, userId, changes: { stageId: updated.stageId, fromStageId: before?.stageId ?? null } });
  }
  return updated ?? null;
}

// Send an email from the workspace's mailer and log it on the timeline.
export async function sendLeadEmail(input: { leadId: string; userId: string; organizationId: string; to: string; subject: string; body: string }) {
  const { sendEmail } = await import("@/lib/mail/mailer");
  await sendEmail(
    { to: input.to, subject: input.subject, html: `<p>${escapeHtml(input.body).replace(/\n/g, "<br/>")}</p>` },
    input.organizationId,
  );
  await ActivityService.addActivity({ leadId: input.leadId, userId: input.userId, type: "email", content: `[email] ${input.subject}` });
  await markLeadContacted(input.leadId);
}
