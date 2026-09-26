"use server";

import { leadLiveFingerprint } from "@/lib/leads/liveFingerprint";
import { assertLeadAccess, filterAccessibleLeadIds } from "@/lib/leads/access";
import { requireOrg, requirePermission, hasPermission, assertWritable } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LeadService } from "@/domains/leads/service";
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
  budget: z.string().trim().max(255).optional().or(z.literal("")).or(emptyStringToUndefined),
  location: z.string().trim().max(255).optional().or(z.literal("")).or(emptyStringToUndefined),
  industry: z.string().trim().max(255).optional().or(z.literal("")).or(emptyStringToUndefined),
  companySize: z.string().trim().max(255).optional().or(z.literal("")).or(emptyStringToUndefined),
  websiteUrl: z.string().trim().max(255).optional().or(z.literal("")).or(emptyStringToUndefined),
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

  const { OrgService } = await import("@/domains/organizations/service");
  const { resolveLeadFieldConfig, findMissingMandatoryLeadFields } = await import("@/lib/leads/fieldConfig");
  const org = await OrgService.getOrganization(organizationId);
  const fieldConfig = resolveLeadFieldConfig(org?.leadFieldConfig);

  const customDataMerged: Record<string, unknown> = { ...(parsed.data.customData ?? {}) };
  if (parsed.data.budget && fieldConfig.budget !== "hidden") customDataMerged.budget = parsed.data.budget.trim();
  if (parsed.data.location && fieldConfig.location !== "hidden") customDataMerged.location = parsed.data.location.trim();
  if (parsed.data.industry && fieldConfig.industry !== "hidden") customDataMerged.industry = parsed.data.industry.trim();
  if (parsed.data.companySize && fieldConfig.companySize !== "hidden") customDataMerged.companySize = parsed.data.companySize.trim();
  if (parsed.data.websiteUrl && fieldConfig.websiteUrl !== "hidden") customDataMerged.websiteUrl = parsed.data.websiteUrl.trim();

  // Strip hidden fields
  for (const [k, req] of Object.entries(fieldConfig)) {
    if (req === "hidden") {
      delete customDataMerged[k];
    }
  }

  // Pass empty strings as undefined
  const data = {
    name: parsed.data.name.trim(),
    email: parsed.data.email?.trim() || undefined,
    phone: parsed.data.phone?.trim() || undefined,
    company: fieldConfig.company === "hidden" ? undefined : (parsed.data.company?.trim() || undefined),
    ownerId: parsed.data.ownerId || undefined,
    customData: customDataMerged,
  };

  const missing = findMissingMandatoryLeadFields(fieldConfig, data);
  if (missing.length > 0) {
    const fieldErrors = Object.fromEntries(missing.map((m) => [m.key, `${m.label} is required.`]));
    return fail("VALIDATION", `Please fill in required field(s): ${missing.map((m) => m.label).join(", ")}`, fieldErrors);
  }

  try {
    // Required-field enforcement now lives in LeadService.createLead so every create path (API,
    // import, ingestion, booking) shares it — see lib/leads/requiredFields.ts.
    await PlanService.assertCanAddLead(organizationId);

    // Validate + clean org-defined custom fields. Admin-only fields are gated by role.
    const isAdmin = await hasPermission("settings.manage");
    const customData = await CustomFieldService.validate(organizationId, parsed.data.customData ?? {}, { isAdmin, isNew: true });

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
  budget: z.string().optional().or(z.literal("")),
  location: z.string().optional().or(z.literal("")),
  industry: z.string().optional().or(z.literal("")),
  companySize: z.string().optional().or(z.literal("")),
  websiteUrl: z.string().optional().or(z.literal("")),
  customData: z.record(z.string(), z.unknown()).optional(),
  // ISO timestamp the editor loaded the lead with — enables optimistic concurrency.
  expectedUpdatedAt: z.string().optional().or(z.literal("")),
});

export async function updateLeadAction(input: z.infer<typeof updateLeadSchema>) {
  const { userId, organizationId } = await requirePermission("leads.edit");

  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  }

  const { id, expectedUpdatedAt, customData: inputCustomData, budget, location, industry, companySize, websiteUrl, ...data } = parsed.data;

  const { OrgService } = await import("@/domains/organizations/service");
  const { resolveLeadFieldConfig, findMissingMandatoryLeadFields } = await import("@/lib/leads/fieldConfig");
  const org = await OrgService.getOrganization(organizationId);
  const fieldConfig = resolveLeadFieldConfig(org?.leadFieldConfig);

  const current = await LeadService.getLead(id, organizationId);
  if (!current) return fail("NOT_FOUND", "This lead no longer exists or was moved.");

  const currentCustom = (current.customData as Record<string, unknown> | null) ?? {};
  const updatedCustom: Record<string, unknown> = { ...currentCustom, ...(inputCustomData ?? {}) };

  if (budget !== undefined) {
    if (fieldConfig.budget === "hidden") delete updatedCustom.budget;
    else if (budget.trim()) updatedCustom.budget = budget.trim();
    else delete updatedCustom.budget;
  }
  if (location !== undefined) {
    if (fieldConfig.location === "hidden") delete updatedCustom.location;
    else if (location.trim()) updatedCustom.location = location.trim();
    else delete updatedCustom.location;
  }
  if (industry !== undefined) {
    if (fieldConfig.industry === "hidden") delete updatedCustom.industry;
    else if (industry.trim()) updatedCustom.industry = industry.trim();
    else delete updatedCustom.industry;
  }
  if (companySize !== undefined) {
    if (fieldConfig.companySize === "hidden") delete updatedCustom.companySize;
    else if (companySize.trim()) updatedCustom.companySize = companySize.trim();
    else delete updatedCustom.companySize;
  }
  if (websiteUrl !== undefined) {
    if (fieldConfig.websiteUrl === "hidden") delete updatedCustom.websiteUrl;
    else if (websiteUrl.trim()) updatedCustom.websiteUrl = websiteUrl.trim();
    else delete updatedCustom.websiteUrl;
  }

  // Cleanup empty strings to undefined
  const cleanData: Record<string, any> = {};
  if (data.name !== undefined) cleanData.name = data.name;
  if (data.email !== undefined) cleanData.email = data.email || undefined;
  if (data.phone !== undefined) cleanData.phone = data.phone || undefined;
  if (data.company !== undefined) {
    cleanData.company = fieldConfig.company === "hidden" ? undefined : (data.company || undefined);
  }

  // Validate resulting lead against mandatory fields
  const candidateLead = {
    ...current,
    ...cleanData,
    company: cleanData.company !== undefined ? cleanData.company : current.company,
    customData: updatedCustom,
  };
  const missing = findMissingMandatoryLeadFields(fieldConfig, candidateLead as Record<string, unknown>);
  if (missing.length > 0) {
    const fieldErrors = Object.fromEntries(missing.map((m) => [m.key, `${m.label} is required.`]));
    return fail("VALIDATION", `Please fill in required field(s): ${missing.map((m) => m.label).join(", ")}`, fieldErrors);
  }

  try {
    await assertLeadAccess(id, { userId, organizationId });
    const expected = expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined;
    const lead = await LeadService.updateLead(id, cleanData, userId, organizationId, expected);
    if (!lead) return fail("NOT_FOUND", "This lead no longer exists or was moved.");

    // Update customData if any configurable custom fields were passed
    if (budget !== undefined || location !== undefined || industry !== undefined || companySize !== undefined || websiteUrl !== undefined || inputCustomData !== undefined) {
      await LeadService.updateCustomData(id, updatedCustom, organizationId);
    }

    revalidatePath('/leads');
    revalidatePath(`/leads/${id}`);
    return ok(lead);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateCustomDataAction(leadId: string, data: Record<string, unknown>) {
  const { userId, organizationId } = await requirePermission("leads.edit");
  try {
    await assertLeadAccess(leadId, { userId, organizationId });
    // Same server-side validation as create: enforce required/options/types and coerce values.
    const isAdmin = await hasPermission("settings.manage");
    const current = await LeadService.getLead(leadId, organizationId);
    if (!current) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    const validated = await CustomFieldService.validate(organizationId, data, { isAdmin, existing: (current.customData as Record<string, unknown>) ?? {} });
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
  const { userId, organizationId } = await assertWritable();
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
  const deletedIds: string[] = [];
  for (const id of leadIds) {
    try {
      const row = await LeadService.deleteLead(id, userId, organizationId);
      if (row) { deleted++; deletedIds.push(id); }
      else failed++;
    } catch {
      failed++;
    }
  }
  // Only record the operation if it actually deleted something — a batch that matched nothing
  // (every id already gone, or all foreign to this org) shouldn't leave an entry behind.
  if (deleted > 0) {
    await AuditService.log({
      organizationId,
      userId,
      action: "lead.bulk_delete",
      entityType: "organization",
      entityId: organizationId,
      metadata: { requested: leadIds.length, deleted, failed, sampleIds: deletedIds.slice(0, 50), truncated: deletedIds.length > 50 },
    });
  }
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
    await AuditService.log({ organizationId, userId, action: "lead.recycle_bin.empty", entityType: "organization", entityId: organizationId, metadata: { purgedCount: res.purgedCount } });
    revalidatePath('/leads/recycle-bin');
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function changeLeadStatusAction(id: string, status: string, reason?: string) {
  const { userId, organizationId } = await requirePermission("leads.edit");
  try {
    await assertLeadAccess(id, { userId, organizationId });
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
  const allowed = new Set(await filterAccessibleLeadIds(parsed.data.leadIds, { userId, organizationId }));
  for (const id of parsed.data.leadIds) {
    if (!allowed.has(id)) {
      failed++;
      continue;
    }
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
    await assertLeadAccess(parsed.data.leadId, { userId, organizationId });

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
  const { userId, organizationId } = await assertWritable();

  const parsed = deleteNoteSchema.safeParse({ noteId, leadId });
  if (!parsed.success) {
    return fail("VALIDATION", "Note ID and Lead ID are required.", zodFieldErrors(parsed.error));
  }

  try {
    await assertLeadAccess(parsed.data.leadId, { userId, organizationId });

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
  const { userId, organizationId } = await assertWritable();

  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please provide valid note content.", zodFieldErrors(parsed.error));
  }

  try {
    await assertLeadAccess(parsed.data.leadId, { userId, organizationId });

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
    await assertLeadAccess(input.leadId, { userId, organizationId });
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

    const leadIds = await filterAccessibleLeadIds(input.leadIds, { userId, organizationId });
    if (leadIds.length === 0) return fail("NOT_FOUND", "None of the selected leads are assigned to you.");
    const updatedLeads = await AssignmentService.bulkAssignLeads({
      leadIds,
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
  const { userId, organizationId } = await requireOrg();
  const { hasPermission } = await import("@/lib/rbac");
  const isAdmin = await hasPermission("settings.manage");
  return LeadService.listLeads({
    organizationId,
    status,
    page,
    limit,
    enforceOwnerId: isAdmin ? undefined : userId,
  });
}

export async function checkLeadDuplicatesAction(leadId: string) {
  try {
    const { userId, organizationId } = await requireOrg();
    const lead = await LeadService.getLead(leadId, organizationId);
    if (!lead) return { count: 0 };
    await assertLeadAccess(leadId, { userId, organizationId });

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

// Quick follow-ups set from the lead header. Only THESE are rescheduled/cleared here — other pending
// follow-ups (manual reminders, personal-mode sequence steps) are left alone. It used to grab the
// newest pending follow-up of any kind, so scheduling a call could move a sequence's WhatsApp task,
// and "Clear" cancelled every reminder on the lead. Meetings and site visits are booked as meetings
// (src/domains/meetings), not here.

export async function updateLeadFollowUpAction(leadId: string, nextFollowUpAt: string | null) {
  const { userId, organizationId } = await assertWritable();

  // Guard against an unparseable date string reaching `new Date(...)` → Invalid Date in the column.
  let followUpDate: Date | null = null;
  if (nextFollowUpAt) {
    followUpDate = new Date(nextFollowUpAt);
    if (Number.isNaN(followUpDate.getTime())) {
      return fail("VALIDATION", "That follow-up date is invalid. Please pick a valid date and time.");
    }
  }

  try {
    await assertLeadAccess(leadId, { userId, organizationId });
    const { setLeadNextFollowUp } = await import("@/domains/leads/leadActions");
    const updated = await setLeadNextFollowUp(leadId, followUpDate, userId, organizationId);
    if (!updated) return fail("NOT_FOUND", "This lead no longer exists or was moved.");

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
  const { userId, organizationId } = await assertWritable();
  try {
    await assertLeadAccess(leadId, { userId, organizationId });
    const { updateLeadStageAndValue } = await import("@/domains/leads/leadActions");
    const updated = await updateLeadStageAndValue(leadId, input, userId, organizationId);
    if (!updated) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

// One-tap outcome after a call that connected: "Interested" moves the lead into the workspace's
// first in-progress status, "Not interested" into its first lost status (with that as the reason).
// Resolved by status CATEGORY so it works with custom status names.
export async function quickDispositionAction(leadId: string, outcome: "interested" | "not_interested") {
  const { userId, organizationId } = await requirePermission("leads.edit");
  try {
    await assertLeadAccess(leadId, { userId, organizationId });
    const { CustomStatusSchemaService } = await import("@/domains/leads/customStatusSchemaService");
    const schema = await CustomStatusSchemaService.getTenantStatusSchema(organizationId);
    const wanted = outcome === "interested" ? "in_progress" : "lost";
    const target = [...schema].sort((a, b) => a.orderIndex - b.orderIndex).find((st) => st.category === wanted);
    if (!target) return fail("VALIDATION", `Your workspace has no ${outcome === "interested" ? "in-progress" : "lost"} status to move this lead to.`);
    const lead = await LeadService.changeStatus(leadId, target.key, userId, organizationId, outcome === "not_interested" ? "Not interested" : undefined);
    if (!lead) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    return ok({ status: target.key, label: target.label });
  } catch (e) {
    return actionFail(e);
  }
}

// Polled by the lead profile's live Next Best Action card: a change token for the lead (see
// leadLiveFingerprint). Read-only, so read-only/impersonated sessions may call it too. Null = gone
// or no access — the card just stops refreshing.
export async function leadLiveFingerprintAction(leadId: string): Promise<string | null> {
  try {
    const id = z.guid().parse(leadId);
    const { userId, organizationId } = await requireOrg();
    await assertLeadAccess(id, { userId, organizationId });
    return await leadLiveFingerprint(id, organizationId);
  } catch {
    return null;
  }
}
