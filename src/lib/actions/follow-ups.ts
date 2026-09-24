"use server";

import { assertWritable } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { FollowUpService } from "@/domains/follow-ups/service";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";
import { assertLeadAccess } from "@/lib/leads/access";
import { db } from "@/db";
import { followUps } from "@/db/schema";
import { eq } from "drizzle-orm";

// A follow-up is reachable only through a lead the user may act on.
async function assertFollowUpAccess(id: string, ctx: { userId: string; organizationId: string }) {
  const [row] = await db.select({ leadId: followUps.leadId }).from(followUps).where(eq(followUps.id, id)).limit(1);
  if (!row) throw new Error("Follow-up not found");
  await assertLeadAccess(row.leadId, ctx);
}

const followUpSchema = z.object({
  leadId: z.string().uuid(),
  type: z.enum(["Call", "WhatsApp", "Email", "Task", "Note", "Custom"]),
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional(),
  dueAt: z.coerce.date(),
  userId: z.string().uuid().optional(), // Can assign to someone else, default to self
});

export async function createFollowUp(input: z.infer<typeof followUpSchema>) {
  const { userId: sessionUserId, organizationId } = await assertWritable();

  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please add a title, type, and a valid due date.", zodFieldErrors(parsed.error));
  }

  const { leadId, type, title, description, dueAt, userId } = parsed.data;

  try {
    await assertLeadAccess(leadId, { userId: sessionUserId, organizationId });
    const followUp = await FollowUpService.createFollowUp({
      leadId,
      type,
      title,
      description,
      dueAt,
      userId: userId || sessionUserId,
      organizationId,
    });

    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/follow-ups');
    return ok(followUp);
  } catch (e) {
    return actionFail(e);
  }
}

export async function completeFollowUp(id: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertFollowUpAccess(id, { userId, organizationId });
    const updated = await FollowUpService.completeFollowUp(id, organizationId);
    if (!updated) return fail("NOT_FOUND", "This follow-up no longer exists.");
    revalidatePath(`/leads/${updated.leadId}`);
    revalidatePath('/follow-ups');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function cancelFollowUp(id: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertFollowUpAccess(id, { userId, organizationId });
    const updated = await FollowUpService.cancelFollowUp(id, organizationId);
    if (!updated) return fail("NOT_FOUND", "This follow-up no longer exists.");
    revalidatePath(`/leads/${updated.leadId}`);
    revalidatePath('/follow-ups');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function snoozeFollowUp(id: string, snoozedUntil: Date) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertFollowUpAccess(id, { userId, organizationId });
    const updated = await FollowUpService.snoozeFollowUp(id, snoozedUntil, organizationId);
    if (!updated) return fail("NOT_FOUND", "This follow-up no longer exists.");
    revalidatePath(`/leads/${updated.leadId}`);
    revalidatePath('/follow-ups');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function rescheduleFollowUp(id: string, dueAt: Date) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertFollowUpAccess(id, { userId, organizationId });
    const updated = await FollowUpService.rescheduleFollowUp(id, dueAt, organizationId);
    if (!updated) return fail("NOT_FOUND", "This follow-up no longer exists.");
    revalidatePath(`/leads/${updated.leadId}`);
    revalidatePath('/follow-ups');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function assignFollowUp(id: string, userId: string) {
  const { userId: sessionUserId, organizationId } = await assertWritable();
  try {
    await assertFollowUpAccess(id, { userId: sessionUserId, organizationId });
    const updated = await FollowUpService.assignFollowUp(id, userId, organizationId);
    if (!updated) return fail("NOT_FOUND", "This follow-up no longer exists.");
    revalidatePath(`/leads/${updated.leadId}`);
    revalidatePath('/follow-ups');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}
