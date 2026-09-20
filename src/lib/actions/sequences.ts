"use server";

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

export async function enrollLeadsAction(sequenceId: string, leadIds: string[]) {
  const { organizationId } = await assertWritable();
  if (!sequenceId) return fail("VALIDATION", "Choose a sequence to enroll into.");
  if (!leadIds?.length) return fail("VALIDATION", "Select at least one lead to enroll.");
  try {
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

export async function stopEnrollmentAction(enrollmentId: string, leadId?: string) {
  const { organizationId } = await assertWritable();
  try {
    const res = await SequenceService.stop(organizationId, enrollmentId);
    if (leadId) revalidatePath(`/leads/${leadId}`);
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}
