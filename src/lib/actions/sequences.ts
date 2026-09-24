"use server";

import { assertLeadAccess, filterAccessibleLeadIds } from "@/lib/leads/access";
import { db } from "@/db";
import { sequenceEnrollments } from "@/db/schema";
import { and, eq } from "drizzle-orm";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrg, assertWritable } from "@/lib/rbac";
import { SequenceService } from "@/domains/leads/sequenceService";
import { ok, fail, actionFail } from "@/lib/actions/result";

const stepSchema = z.object({
  dayOffset: z.coerce.number().int().min(0).max(365),
  channel: z.enum(["whatsapp", "email"]),
  body: z.string().min(1).max(2000),
  attachmentUrl: z.string().url().max(2048).nullish().or(z.literal("")).transform((v) => v || null),
  attachmentName: z.string().max(255).nullish().or(z.literal("")).transform((v) => v || null),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullish().or(z.literal("")).transform((v) => v || null),
  steps: z.array(stepSchema).min(1, "Add at least one step"),
});

export async function createSequenceAction(input: unknown) {
  const { organizationId } = await assertWritable();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Add a name and at least one valid step (each with a message under 2,000 characters).");
  }
  try {
    const seq = await SequenceService.create(organizationId, parsed.data.name, parsed.data.steps, parsed.data.description);
    revalidatePath("/sequences");
    return ok(seq);
  } catch (e) {
    return actionFail(e);
  }
}

export async function listSequencesAction() {
  const { organizationId } = await requireOrg();
  return SequenceService.list(organizationId);
}

export async function enrollLeadsAction(sequenceId: string, requestedLeadIds: string[]) {
  const { userId, organizationId } = await assertWritable();
  if (!sequenceId) return fail("VALIDATION", "Choose a sequence to enroll into.");
  if (!requestedLeadIds?.length) return fail("VALIDATION", "Select at least one lead to enroll.");
  try {
    const leadIds = await filterAccessibleLeadIds(requestedLeadIds, { userId, organizationId });
    if (leadIds.length === 0) return fail("NOT_FOUND", "None of the selected leads are assigned to you.");
    const res = await SequenceService.enroll(organizationId, sequenceId, leadIds);
    revalidatePath("/sequences");
    leadIds.forEach((id) => revalidatePath(`/leads/${id}`));
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function getSequenceAction(sequenceId: string) {
  const { organizationId } = await requireOrg();
  return SequenceService.getWithSteps(sequenceId, organizationId);
}

export async function getSequenceDetailAction(sequenceId: string) {
  const { organizationId } = await requireOrg();
  return SequenceService.getDetail(sequenceId, organizationId);
}

export async function updateSequenceAction(sequenceId: string, input: unknown) {
  const { organizationId } = await assertWritable();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Add a name and at least one valid step (each with a message under 2,000 characters).");
  }
  try {
    const res = await SequenceService.update(organizationId, sequenceId, parsed.data.name, parsed.data.steps, parsed.data.description);
    revalidatePath("/sequences");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function setSequenceActiveAction(sequenceId: string, isActive: boolean) {
  const { organizationId } = await assertWritable();
  try {
    const row = await SequenceService.setActive(organizationId, sequenceId, isActive);
    if (!row) return fail("NOT_FOUND", "This sequence no longer exists.");
    revalidatePath("/sequences");
    revalidatePath(`/sequences/${sequenceId}`);
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteSequenceAction(sequenceId: string) {
  const { organizationId } = await assertWritable();
  try {
    const res = await SequenceService.delete(organizationId, sequenceId);
    revalidatePath("/sequences");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

// The enrollment's lead, if this user may act on it (same rule as the lead profile). Throws otherwise.
async function enrollmentLead(enrollmentId: string, ctx: { userId: string; organizationId: string }) {
  const [enr] = await db
    .select({ leadId: sequenceEnrollments.leadId })
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.id, enrollmentId), eq(sequenceEnrollments.organizationId, ctx.organizationId)))
    .limit(1);
  if (!enr) throw new Error("Enrollment not found");
  await assertLeadAccess(enr.leadId, ctx);
  return enr.leadId;
}

// Pause / resume one lead's sequence (the sequence itself keeps running for everyone else).
export async function pauseEnrollmentAction(enrollmentId: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    const leadId = await enrollmentLead(enrollmentId, { userId, organizationId });
    const res = await SequenceService.pause(organizationId, enrollmentId);
    if (!res.paused) return fail("VALIDATION", "Only a running sequence can be paused.");
    revalidatePath(`/leads/${leadId}`);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function resumeEnrollmentAction(enrollmentId: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    const leadId = await enrollmentLead(enrollmentId, { userId, organizationId });
    const res = await SequenceService.resume(organizationId, enrollmentId);
    if (!res.resumed) return fail("VALIDATION", "This sequence isn't paused.");
    revalidatePath(`/leads/${leadId}`);
    return ok({ nextRunAt: res.nextRunAt?.toISOString() ?? null });
  } catch (e) {
    return actionFail(e);
  }
}

export async function stopEnrollmentAction(enrollmentId: string, leadId?: string) {
  const { userId, organizationId } = await assertWritable();
  try {
    await enrollmentLead(enrollmentId, { userId, organizationId });
    const res = await SequenceService.stop(organizationId, enrollmentId);
    if (leadId) revalidatePath(`/leads/${leadId}`);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}
