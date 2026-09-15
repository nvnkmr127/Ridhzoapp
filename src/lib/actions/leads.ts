"use server";

import { requireOrg, requirePermission, hasPermission } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LeadService } from "@/domains/leads/service";
import { OrgService } from "@/domains/organizations/service";
import { assertLeadInOrg } from "@/domains/leads/ownership";
import { CustomFieldService } from "@/domains/customFields/service";
import { AuditService } from "@/domains/audit/service";
import { PlanService } from "@/domains/billing/planService";
import { ActivityService } from "@/domains/activities/service";
import { ok, fail, actionFail, zodFieldErrors, type ActionResult } from "@/lib/actions/result";

const emptyStringToUndefined = z.string().regex(/^\s*$/).transform(() => "");
const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuidSchema = z.string().regex(uuidRegex, "Invalid ID");

// A present phone must carry at least 7 digits — rejects "abc"/"123" while allowing any format.
const phoneField = z
  .string()
  .trim()
  .max(50, "Phone number too long")
  .refine((v) => v.replace(/\D/g, "").length >= 7, "Enter a valid phone number")
  .optional()
  .or(z.literal(""))
  .or(emptyStringToUndefined);

const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")).or(emptyStringToUndefined),
  phone: phoneField,
  company: z.string().trim().max(255).optional().or(z.literal("")).or(emptyStringToUndefined),
  ownerId: uuidSchema.optional().or(z.literal("")).or(emptyStringToUndefined),
  customData: z.record(z.string(), z.unknown()).optional(),
});

export async function createLeadAction(
  input: z.infer<typeof createLeadSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof LeadService.createLead>>>> {
  const { userId, organizationId } = await requirePermission("leads.edit");

  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  }

  // Pass empty strings as undefined
  const data = {
    name: parsed.data.name.trim(),
    email: parsed.data.email?.trim() || undefined,
    phone: parsed.data.phone?.trim() || undefined,
    company: parsed.data.company?.trim() || undefined,
    ownerId: parsed.data.ownerId || undefined,
  };

  try {
    // Enforce this org's required-field configuration (name is always required by schema).
    const org = await OrgService.getOrganization(organizationId);
    const required = (org?.requiredLeadFields ?? ["name"]) as Array<keyof typeof data>;
    const missing = required.filter((f) => !data[f]);
    if (missing.length) {
      return fail(
        "VALIDATION",
        `Missing required field(s): ${missing.join(", ")}`,
        Object.fromEntries(missing.map((f) => [f, "This field is required."])),
      );
    }

    await PlanService.assertCanAddLead(organizationId);

    // Validate + clean org-defined custom fields. Admin-only fields are gated by role.
    const isAdmin = await hasPermission("settings.manage");
    const customData = await CustomFieldService.validate(organizationId, parsed.data.customData ?? {}, { isAdmin });

    const lead = await LeadService.createLead({ ...data, customData }, userId, organizationId);

    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath('/leads');
    return ok(lead);
  } catch (e) {
    console.error(`[createLeadAction:Server] failed to create lead:`, e);
    return actionFail(e);
  }
}

const updateLeadSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1, "Name is required").max(255).optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: phoneField,
  company: z.string().optional().or(z.literal("")),
  // ISO timestamp the editor loaded the lead with — enables optimistic concurrency.
  expectedUpdatedAt: z.string().optional().or(z.literal("")),
});

export async function updateLeadAction(input: z.infer<typeof updateLeadSchema>) {
  const { userId, organizationId } = await requirePermission("leads.edit");

  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  }

  const { id, expectedUpdatedAt, ...data } = parsed.data;

  // Cleanup empty strings to undefined
  const cleanData = {
    name: data.name,
    email: data.email || undefined,
    phone: data.phone || undefined,
    company: data.company || undefined,
  };

  try {
    const expected = expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined;
    const lead = await LeadService.updateLead(id, cleanData, userId, organizationId, expected);
    if (!lead) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    revalidatePath('/leads');
    revalidatePath(`/leads/${id}`);
    return ok(lead);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateCustomDataAction(leadId: string, data: Record<string, unknown>) {
  const { organizationId } = await requirePermission("leads.edit");
  try {
    // Same server-side validation as create: enforce required/options/types and coerce values.
    const isAdmin = await hasPermission("settings.manage");
    const current = await LeadService.getLead(leadId, organizationId);
    if (!current) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    const validated = await CustomFieldService.validate(organizationId, data, { isAdmin });
    // Keys the caller is allowed to edit; for these, `validated` is authoritative (a value the user
    // cleared is absent → dropped). Every other stored key (internal scoring/attribution, extra
    // webhook payload, and admin-only fields a non-admin can't see) is preserved untouched.
    const defs = await CustomFieldService.list(organizationId);
    const editableKeys = new Set(defs.filter((d) => !d.disabled && (isAdmin || !d.adminOnly)).map((d) => d.key));
    const result: Record<string, unknown> = { ...validated };
    for (const [k, v] of Object.entries((current.customData as Record<string, unknown>) ?? {})) {
      if (k in result || editableKeys.has(k)) continue;
      result[k] = v;
    }
    const updated = await LeadService.updateCustomData(leadId, result, organizationId);
    if (!updated) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    revalidatePath(`/leads/${leadId}`);
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteLeadAction(id: string) {
  const { userId, organizationId } = await requireOrg();
  const allowed = await hasPermission("leads.delete");
  if (!allowed) {
    const lead = await LeadService.getLead(id, organizationId);
    if (!lead || lead.ownerId !== userId) {
      return fail("FORBIDDEN", "You don't have permission to delete this lead. Contact an admin.");
    }
  }
  try {
    const deleted = await LeadService.deleteLead(id, userId, organizationId);
    if (!deleted) return fail("NOT_FOUND", "This lead no longer exists or was already deleted.");
    await AuditService.log({ organizationId, userId, action: "lead.delete", entityType: "lead", entityId: id });
    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath('/leads');
    revalidatePath('/leads/recycle-bin');
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}

const bulkDeleteSchema = z.object({ leadIds: z.array(uuidSchema).min(1) });

// Soft-delete many leads to the recycle bin at once. Reports partial success —
// one failing row never aborts the batch.
export async function bulkDeleteLeadsAction(input: z.infer<typeof bulkDeleteSchema>) {
  const { userId, organizationId } = await requirePermission("leads.delete");
  const parsed = bulkDeleteSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Select at least one lead to delete.");
  const { leadIds } = parsed.data;
  let deleted = 0;
  let failed = 0;
  for (const id of leadIds) {
    try {
      const row = await LeadService.deleteLead(id, userId, organizationId);
      if (row) deleted++;
      else failed++;
    } catch {
      failed++;
    }
  }
  await AuditService.log({ organizationId, userId, action: "lead.bulk_delete", entityType: "organization", entityId: organizationId });
  revalidatePath('/');
  revalidatePath('/my-dashboard');
  revalidatePath("/leads");
  revalidatePath("/leads/recycle-bin");
  return ok({ deleted, failed, requested: leadIds.length });
}

// Recycle bin: list, restore, and (super-admin only) permanent removal.
export async function listDeletedLeadsAction() {
  const { organizationId } = await requireOrg();
  return LeadService.listDeletedLeads(organizationId);
}

export async function restoreLeadAction(id: string) {
  const { userId, organizationId } = await requirePermission("leads.delete");
  try {
    const restored = await LeadService.restoreLead(id, organizationId);
    if (!restored) return fail("NOT_FOUND", "This lead is no longer in the recycle bin.");
    await AuditService.log({ organizationId, userId, action: "lead.restore", entityType: "lead", entityId: id });
    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath('/leads');
    revalidatePath('/leads/recycle-bin');
    return ok({ restored: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function purgeLeadAction(id: string) {
  // leads.purge is admin-only by default — the "super" gate on permanent deletion.
  const { userId, organizationId } = await requirePermission("leads.purge");
  try {
    const purged = await LeadService.purgeLead(id, organizationId);
    if (!purged) return fail("NOT_FOUND", "This lead is no longer in the recycle bin.");
    await AuditService.log({ organizationId, userId, action: "lead.purge", entityType: "lead", entityId: id });
    revalidatePath('/leads/recycle-bin');
    return ok({ purged: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function emptyRecycleBinAction() {
  const { userId, organizationId } = await requirePermission("leads.purge");
  try {
    const res = await LeadService.emptyRecycleBin(organizationId);
    await AuditService.log({ organizationId, userId, action: "lead.recycle_bin.empty", entityType: "organization", entityId: organizationId });
    revalidatePath('/leads/recycle-bin');
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function changeLeadStatusAction(id: string, status: string, reason?: string) {
  const { userId, organizationId } = await requirePermission("leads.edit");
  try {
    const lead = await LeadService.changeStatus(id, status, userId, organizationId, reason);
    if (!lead) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath('/leads');
    revalidatePath(`/leads/${id}`);
    return ok(lead);
  } catch (e) {
    return actionFail(e);
  }
}

const bulkChangeStatusSchema = z.object({
  leadIds: z.array(uuidSchema).min(1),
  status: z.string().min(1),
});

// Reports partial success — one failing row never aborts the batch.
export async function bulkChangeLeadStatusAction(input: z.infer<typeof bulkChangeStatusSchema>) {
  const { userId, organizationId } = await requirePermission("leads.edit");

  const parsed = bulkChangeStatusSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Select at least one lead and a status.");

  let updated = 0;
  let failed = 0;
  for (const id of parsed.data.leadIds) {
    try {
      const lead = await LeadService.changeStatus(id, parsed.data.status, userId, organizationId);
      if (lead) updated++;
      else failed++;
    } catch {
      failed++;
    }
  }

  revalidatePath('/');
  revalidatePath('/my-dashboard');
  revalidatePath('/leads');
  return ok({ updated, failed, requested: parsed.data.leadIds.length });
}

const addNoteSchema = z.object({
  leadId: uuidSchema,
  content: z.string().trim().min(1, "Note cannot be empty").max(10000, "Note cannot exceed 10,000 characters"),
});

export async function addNoteAction(input: z.infer<typeof addNoteSchema>) {
  const { userId, organizationId } = await requirePermission("leads.edit");

  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  }

  try {
    // The note attaches to a lead — make sure it's one this org owns.
    await assertLeadInOrg(parsed.data.leadId, organizationId);

    const activity = await ActivityService.addActivity({
      leadId: parsed.data.leadId,
      userId,
      type: 'note',
      content: parsed.data.content,
    });

    revalidatePath(`/leads/${parsed.data.leadId}`);
    return ok(activity);
  } catch (e) {
    return actionFail(e);
  }
}

const deleteNoteSchema = z.object({
  noteId: uuidSchema,
  leadId: uuidSchema,
});

export async function deleteNoteAction(noteId: string, leadId: string) {
  const { organizationId } = await requireOrg();

  const parsed = deleteNoteSchema.safeParse({ noteId, leadId });
  if (!parsed.success) {
    return fail("VALIDATION", "Note ID and Lead ID are required.", zodFieldErrors(parsed.error));
  }

  try {
    await assertLeadInOrg(parsed.data.leadId, organizationId);

    const deleted = await ActivityService.deleteActivity(parsed.data.noteId, parsed.data.leadId);
    if (!deleted) {
      return fail("NOT_FOUND", "This note was already deleted.");
    }

    revalidatePath(`/leads/${parsed.data.leadId}`);
    return ok(deleted);
  } catch (e) {
    return actionFail(e);
  }
}

const updateNoteSchema = z.object({
  noteId: uuidSchema,
  leadId: uuidSchema,
  content: z.string().trim().min(1, "Note cannot be empty").max(10000, "Note cannot exceed 10,000 characters"),
});

export async function updateNoteAction(input: z.infer<typeof updateNoteSchema>) {
  const { organizationId } = await requireOrg();

  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please provide valid note content.", zodFieldErrors(parsed.error));
  }

  try {
    await assertLeadInOrg(parsed.data.leadId, organizationId);

    const updated = await ActivityService.updateActivity(parsed.data.noteId, parsed.data.leadId, parsed.data.content);
    if (!updated) {
      return fail("NOT_FOUND", "This note no longer exists.");
    }

    revalidatePath(`/leads/${parsed.data.leadId}`);
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export const assignLeadAction = async (input: { leadId: string, ownerId: string | null, teamId?: string | null }) => {
  const { userId, organizationId } = await requirePermission("leads.edit");

  if (!input.leadId) return fail("VALIDATION", "A lead is required.");
  // teamId omitted (undefined) = change owner only, keep team. null = clear team.
  if (!input.ownerId && input.teamId == null) return fail("VALIDATION", "Choose a user or a team to assign to.");

  try {
    const { AssignmentService } = await import("@/domains/leads/assignmentService");

    const updatedLead = await AssignmentService.assignLead({
      leadId: input.leadId,
      ownerId: input.ownerId,
      teamId: input.teamId,
      assignedById: userId,
      organizationId,
    });

    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath(`/leads/${input.leadId}`);
    revalidatePath("/leads");

    return ok({ lead: updatedLead });
  } catch (e) {
    return actionFail(e);
  }
};

export const bulkAssignLeadAction = async (input: { leadIds: string[], ownerId: string | null, teamId: string | null }) => {
  const { userId, organizationId } = await requirePermission("leads.edit");

  if (!input.leadIds || input.leadIds.length === 0) return fail("VALIDATION", "Select at least one lead.");
  if (!input.ownerId && !input.teamId) return fail("VALIDATION", "Choose a user or a team to assign to.");

  try {
    const { AssignmentService } = await import("@/domains/leads/assignmentService");

    const updatedLeads = await AssignmentService.bulkAssignLeads({
      leadIds: input.leadIds,
      ownerId: input.ownerId,
      teamId: input.teamId,
      assignedById: userId,
      organizationId,
    });

    revalidatePath('/');
    revalidatePath('/my-dashboard');
    revalidatePath("/leads");

    return ok({ count: updatedLeads.length });
  } catch (e) {
    return actionFail(e);
  }
};

export async function listStageLeadsAction(status: string, page: number = 1, limit: number = 20) {
  const { organizationId } = await requireOrg();
  return LeadService.listLeads({
    organizationId,
    status,
    page,
    limit,
  });
}

export async function checkLeadDuplicatesAction(leadId: string) {
  try {
    const { organizationId } = await requireOrg();
    const lead = await LeadService.getLead(leadId, organizationId);
    if (!lead) return { count: 0 };

    const email = lead.email?.trim();
    const phone = lead.phone?.trim();

    if (!email && !phone) return { count: 0 };

    const { db } = await import("@/db");
    const { leads } = await import("@/db/schema");
    const { eq, and, or, ne } = await import("drizzle-orm");

    const conds = [];
    if (email) conds.push(eq(leads.email, email));
    if (phone) conds.push(eq(leads.phone, phone));

    if (conds.length === 0) return { count: 0 };

    const dupes = await db.select({ id: leads.id }).from(leads).where(
      and(
        eq(leads.organizationId, organizationId),
        ne(leads.id, leadId),
        or(...conds)
      )
    );

    return { count: dupes.length };
  } catch {
    return { count: 0 };
  }
}

export async function updateLeadFollowUpAction(leadId: string, nextFollowUpAt: string | null) {
  const { userId, organizationId } = await requireOrg();

  // Guard against an unparseable date string reaching `new Date(...)` → Invalid Date in the column.
  let followUpDate: Date | null = null;
  if (nextFollowUpAt) {
    followUpDate = new Date(nextFollowUpAt);
    if (Number.isNaN(followUpDate.getTime())) {
      return fail("VALIDATION", "That follow-up date is invalid. Please pick a valid date and time.");
    }
  }

  try {
    const { db } = await import("@/db");
    const { leads, followUps } = await import("@/db/schema");
    const { eq, and, desc } = await import("drizzle-orm");

    const [updated] = await db.update(leads)
      .set({ nextFollowUpAt: followUpDate, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .returning();

    if (!updated) return fail("NOT_FOUND", "This lead no longer exists or was moved.");

    // Sync with followUps table so follow-up appears in Follow-ups tab, list, and calendar
    if (followUpDate) {
      const [existing] = await db
        .select()
        .from(followUps)
        .where(and(eq(followUps.leadId, leadId), eq(followUps.status, "pending")))
        .orderBy(desc(followUps.createdAt))
        .limit(1);

      if (existing) {
        await db.update(followUps)
          .set({ dueAt: followUpDate, updatedAt: new Date() })
          .where(eq(followUps.id, existing.id));
      } else {
        await db.insert(followUps).values({
          leadId,
          userId: updated.ownerId || userId,
          type: "followup",
          title: `Follow-up with ${updated.name || "lead"}`,
          status: "pending",
          dueAt: followUpDate,
        });
      }
    } else {
      await db.update(followUps)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(followUps.leadId, leadId), eq(followUps.status, "pending")));
    }

    // Normalize next_follow_up_at to the soonest pending follow-up (not just the date clicked).
    const { syncLeadFollowUpState } = await import("@/domains/follow-ups/state");
    await syncLeadFollowUpState(leadId);

    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
    revalidatePath('/follow-ups');
    revalidatePath('/follow-ups/calendar');
    revalidatePath('/');
    revalidatePath('/my-dashboard');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateLeadStageAndValueAction(leadId: string, input: { stageId?: string | null; expectedValue?: string | null }) {
  const { organizationId } = await requireOrg();

  // Reject a non-numeric or negative opportunity value before it hits the numeric column.
  if (input.expectedValue) {
    const n = Number(input.expectedValue);
    if (Number.isNaN(n)) return fail("VALIDATION", "Opportunity value must be a number.");
    if (n < 0) return fail("VALIDATION", "Opportunity value cannot be negative.");
  }

  try {
    const { db } = await import("@/db");
    const { leads } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");

    const [updated] = await db.update(leads)
      .set({
        ...(input.stageId !== undefined ? { stageId: input.stageId || null } : {}),
        ...(input.expectedValue !== undefined ? { expectedValue: input.expectedValue || null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
      .returning();

    if (!updated) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}
