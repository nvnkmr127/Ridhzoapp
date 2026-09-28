import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { followUps } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { LeadService } from "@/domains/leads/service";
import { ActivityService } from "@/domains/activities/service";
import { AuditService } from "@/domains/audit/service";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { leadConflicts } from "@/lib/leads/syncConflicts";

const idSchema = z.guid();

// Lead detail: lead + activity timeline + this lead's follow-ups.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid lead ID format. Expected a valid UUID." }, { status: 400 });
  }

  // One parallel wave: the access check and the rows it guards don't depend on each other, and each
  // serial await here was a full DB round trip. Rows for a lead the caller can't open are discarded.
  const { CustomFieldService } = await import("@/domains/customFields/service");
  const { TagService } = await import("@/domains/tags/service");
  const [lead, isAdmin, defs, activities, fus, tags] = await Promise.all([
    // Owner, admin, or someone attending a meeting with this lead (same rule as the web lead page).
    leadForApi(auth, id),
    auth.userId ? hasPermissionForRoleId(auth.roleId ?? null, "settings.manage") : Promise.resolve(true),
    CustomFieldService.listCached(auth.organizationId),
    // ponytail: newest 100 only — bounds payload and regex overhead for mobile screens.
    ActivityService.getLeadActivities(id, 100),
    db
      .select({ id: followUps.id, title: followUps.title, type: followUps.type, description: followUps.description, status: followUps.status, dueAt: followUps.dueAt })
      .from(followUps)
      .where(eq(followUps.leadId, id))
      .orderBy(asc(followUps.dueAt))
      .limit(50),
    TagService.getForLead(id),
  ]);
  if (!lead) return leadNotFound();
  if (!isAdmin && lead.customData) {
    const cd = { ...(lead.customData as Record<string, unknown>) };
    for (const f of defs) if (f.adminOnly) delete cd[f.key];
    (lead as { customData: unknown }).customData = cd;
  }

  // Server-generated blobs live in customData (cached AI recap, enrichment evidence, score
  // factors). No client reads them from this response — the recap has its own endpoint — and they
  // made every lead-detail payload (and its persisted offline copy) much heavier than it needs to be.
  if (lead.customData && typeof lead.customData === "object") {
    const cd = { ...(lead.customData as Record<string, unknown>) };
    delete cd._aiRecap;
    delete cd._enrichment;
    delete cd._scoreFactors;
    (lead as { customData: unknown }).customData = cd;
  }

  const callActivities = activities.filter(a => a.type === "call");
  const attempts = callActivities.filter(a => a.content?.startsWith("Called —")).length;
  const answered = callActivities.filter(a => a.content?.startsWith("Called —") && (Number(a.durationSec) > 0 || a.content?.includes("Answered"))).length;

  const lastCall = callActivities[0];
  let recentCrossCall = null;
  // If the last call was within the last hour and made by someone other than the current user
  if (lastCall && lastCall.userId && lastCall.userId !== auth.userId) {
    const timeSinceCall = Date.now() - new Date(lastCall.occurredAt || lastCall.createdAt).getTime();
    if (timeSinceCall < 60 * 60 * 1000) {
      recentCrossCall = {
        userName: lastCall.userName || "Another user",
        occurredAt: lastCall.occurredAt || lastCall.createdAt,
      };
    }
  }

  return NextResponse.json({
    data: {
      lead,
      callStats: { attempts, answered },
      recentCrossCall,
      activities: activities.map((a) => ({ 
        id: a.id, 
        type: a.type, 
        content: a.content, 
        createdAt: a.createdAt,
        occurredAt: a.occurredAt,
        userId: a.userId,
        userName: a.userName,
        durationSec: a.durationSec,
        // The phone's call id — the app ties a call's uploaded recording to it (by file name).
        externalRef: a.externalRef ?? null,
      })),
      followUps: fus,
      tags,
    },
  });
}

const patchSchema = z
  .object({
    status: z.string().min(1).optional(),
    // Why a lead was closed as lost (one of /api/v1/me → lossReasons, or free text); ignored otherwise.
    lossReason: z.string().trim().max(200).optional(),
    ownerId: z.guid().nullable().optional(),
    // Contact-field edits (used by the mobile "Edit lead" screen).
    name: z.string().min(1).max(255).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(50).optional().or(z.literal("")),
    company: z.string().max(255).optional().or(z.literal("")),
    budget: z.string().max(255).optional().or(z.literal("")),
    location: z.string().max(255).optional().or(z.literal("")),
    industry: z.string().max(255).optional().or(z.literal("")),
    companySize: z.string().max(255).optional().or(z.literal("")),
    websiteUrl: z.string().max(255).optional().or(z.literal("")),
    customData: z.record(z.string(), z.unknown()).optional(),
    // Pipeline stage and opportunity value ("" / null clears).
    stageId: z.guid().nullable().optional().or(z.literal("")),
    expectedValue: z.string().max(30).nullable().optional(),
    // Next follow-up date (ISO) — mirrored as one pending "followup" task; null clears it.
    nextFollowUpAt: z.string().datetime().nullable().optional(),
    // Offline edits from the app: each changed field's value when the rep edited it. A field someone
    // else has changed since comes back as a 409 conflict instead of being overwritten.
    base: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.ownerId !== undefined ||
      v.name !== undefined ||
      v.email !== undefined ||
      v.phone !== undefined ||
      v.company !== undefined ||
      v.budget !== undefined ||
      v.location !== undefined ||
      v.industry !== undefined ||
      v.companySize !== undefined ||
      v.websiteUrl !== undefined ||
      v.customData !== undefined ||
      v.stageId !== undefined ||
      v.expectedValue !== undefined ||
      v.nextFollowUpAt !== undefined,
    { message: "Provide at least one field to update" },
  );

// Update a lead: edit contact fields, change status, and/or (re)assign its owner.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid lead ID format. Expected a valid UUID." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 422 });

  let currentLead = await leadForApi(auth, id);
  if (!currentLead) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  if (parsed.data.base) {
    const { base, ...patch } = parsed.data;
    // Check, then claim the version the check saw (compare-and-swap). Written in between? Re-read and
    // check again, so a change landing mid-request is never overwritten unseen.
    for (let attempt = 0; ; attempt++) {
      const conflicts = leadConflicts(currentLead as Record<string, unknown>, patch, base as Record<string, unknown>);
      if (conflicts.length) {
        return NextResponse.json({ error: "This lead was changed by someone else.", code: "conflict", conflicts }, { status: 409 });
      }
      if (await LeadService.claimVersion(id, auth.organizationId, currentLead.updatedAt)) break;
      const fresh = attempt < 2 ? await leadForApi(auth, id) : null;
      if (!fresh) return NextResponse.json({ error: "This lead is being changed by someone else. Try again." }, { status: 409 });
      currentLead = fresh;
    }
  }

  const { OrgService } = await import("@/domains/organizations/service");
  const { resolveLeadFieldConfig } = await import("@/lib/leads/fieldConfig");
  const { leadEditFieldErrors } = await import("@/lib/leads/requiredFields");
  const org = await OrgService.getOrganization(auth.organizationId);
  const fieldConfig = resolveLeadFieldConfig(org?.leadFieldConfig);

  const candidateCustom = {
    ...((currentLead.customData as Record<string, unknown>) || {}),
    ...(parsed.data.customData ?? {}),
    ...(parsed.data.budget !== undefined ? { budget: parsed.data.budget || null } : {}),
    ...(parsed.data.location !== undefined ? { location: parsed.data.location || null } : {}),
    ...(parsed.data.industry !== undefined ? { industry: parsed.data.industry || null } : {}),
    ...(parsed.data.companySize !== undefined ? { companySize: parsed.data.companySize || null } : {}),
    ...(parsed.data.websiteUrl !== undefined ? { websiteUrl: parsed.data.websiteUrl || null } : {}),
  };
  const candidateLead = {
    ...currentLead,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
    ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    ...(parsed.data.company !== undefined && fieldConfig.company !== "hidden" ? { company: parsed.data.company || null } : {}),
    customData: candidateCustom,
  };
  // Only fields this request sends are checked — a status change on an older lead must still work.
  const fieldErrors = leadEditFieldErrors(org, candidateLead as Record<string, unknown>, Object.keys(parsed.data).filter((k) => parsed.data[k as keyof typeof parsed.data] !== undefined));
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ error: Object.values(fieldErrors)[0], fieldErrors }, { status: 422 });
  }

  // Only this workspace's statuses (GET /api/v1/statuses) — an unknown key would strand the lead
  // outside every pipeline view and report.
  if (parsed.data.status !== undefined) {
    const { CustomStatusSchemaService } = await import("@/domains/leads/customStatusSchemaService");
    const schema = await CustomStatusSchemaService.getTenantStatusSchema(auth.organizationId);
    if (!schema.some((s) => s.key === parsed.data.status)) {
      return NextResponse.json({ error: `Unknown status "${parsed.data.status}". Use one of: ${schema.map((s) => s.key).join(", ")}.` }, { status: 422 });
    }
  }

  try {
    const { name, email, phone, company } = parsed.data;
    if (name !== undefined || email !== undefined || phone !== undefined || company !== undefined) {
      const updated = await LeadService.updateLead(
        id,
        {
          ...(name !== undefined ? { name } : {}),
          // "" clears the field (updateLead stores it as null).
          ...(email !== undefined ? { email } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(company !== undefined ? { company } : {}),
        },
        auth.userId ?? "",
        auth.organizationId,
      );
      if (!updated) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const hasConfigurableFields =
      parsed.data.budget !== undefined ||
      parsed.data.location !== undefined ||
      parsed.data.industry !== undefined ||
      parsed.data.companySize !== undefined ||
      parsed.data.websiteUrl !== undefined;

    if (parsed.data.customData !== undefined || hasConfigurableFields) {
      const current = await LeadService.getLead(id, auth.organizationId);
      if (!current) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const { CustomFieldService } = await import("@/domains/customFields/service");
      // A partial patch over the stored values; "" / null clears a field.
      const stored = (current.customData as Record<string, unknown>) ?? {};
      const directFields: Record<string, unknown> = {};
      if (parsed.data.budget !== undefined) directFields.budget = parsed.data.budget || null;
      if (parsed.data.location !== undefined) directFields.location = parsed.data.location || null;
      if (parsed.data.industry !== undefined) directFields.industry = parsed.data.industry || null;
      if (parsed.data.companySize !== undefined) directFields.companySize = parsed.data.companySize || null;
      if (parsed.data.websiteUrl !== undefined) directFields.websiteUrl = parsed.data.websiteUrl || null;

      const merged = { ...stored, ...(parsed.data.customData ?? {}), ...directFields };
      const isAdmin = !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));
      let validated: Record<string, unknown>;
      try {
        validated = await CustomFieldService.validate(auth.organizationId, merged, { isAdmin, existing: stored });
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Invalid custom field value" }, { status: 422 });
      }
      // Same as the web save: validated is authoritative for fields this caller may edit; every other
      // stored key (AI recap, scoring/attribution data, admin-only fields for non-admins) is kept.
      const defs = await CustomFieldService.list(auth.organizationId);
      const editable = new Set(defs.filter((d) => !d.disabled && (isAdmin || !d.adminOnly)).map((d) => d.key));
      const result: Record<string, unknown> = { ...validated };
      for (const [k, v] of Object.entries(stored)) if (!(k in result) && !editable.has(k)) result[k] = v;
      // After the keep-stored pass, so a cleared default field isn't restored from `stored`.
      const { withLeadFieldValues } = await import("@/lib/leads/fieldConfig");
      await LeadService.updateCustomData(id, withLeadFieldValues(result, parsed.data), auth.organizationId);
    }
    if (parsed.data.ownerId !== undefined) {
      const { AssignmentService } = await import("@/domains/leads/assignmentService");
      await AssignmentService.assignLead({
        leadId: id,
        ownerId: parsed.data.ownerId,
        teamId: null,
        assignedById: auth.userId,
        organizationId: auth.organizationId,
      });
    }
    if (parsed.data.stageId !== undefined || parsed.data.expectedValue !== undefined) {
      const { updateLeadStageAndValue } = await import("@/domains/leads/leadActions");
      await updateLeadStageAndValue(
        id,
        {
          ...(parsed.data.stageId !== undefined ? { stageId: parsed.data.stageId || null } : {}),
          ...(parsed.data.expectedValue !== undefined ? { expectedValue: parsed.data.expectedValue || null } : {}),
        },
        auth.userId ?? "",
        auth.organizationId,
      );
    }
    if (parsed.data.nextFollowUpAt !== undefined) {
      const { setLeadNextFollowUp } = await import("@/domains/leads/leadActions");
      const at = parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null;
      await setLeadNextFollowUp(id, at, auth.userId ?? currentLead.ownerId ?? "", auth.organizationId);
    }
    if (parsed.data.status !== undefined) {
      await LeadService.changeStatus(id, parsed.data.status, auth.userId ?? null, auth.organizationId, parsed.data.lossReason || null);
    }
    const lead = await LeadService.getLead(id, auth.organizationId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ data: lead });
  } catch (e: any) {
    const fieldErrors = e?.fieldErrors as Record<string, string> | undefined;
    if (fieldErrors) return NextResponse.json({ error: Object.values(fieldErrors)[0], details: fieldErrors }, { status: 409 });
    if (e?.code === "CONFLICT") return NextResponse.json({ error: e.message }, { status: 409 });
    if (e?.code === "VALIDATION") return NextResponse.json({ error: e.message }, { status: 422 });
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id] PATCH", e, { leadId: id });
    return NextResponse.json({ error: "Could not update lead. Please try again.", ref }, { status: 500 });
  }
}

// Soft-delete a lead to the recycle bin (recoverable for 30 days in the web app).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid lead ID format. Expected a valid UUID." }, { status: 400 });
  }

  const targetLead = await LeadService.getLead(id, auth.organizationId);
  if (!targetLead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (auth.userId) {
    const isAdmin = await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage");
    if (!isAdmin && targetLead.ownerId !== auth.userId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
  }

  // Mobile-token requests carry a role — hold it to the same leads.delete gate the web UI enforces.
  // A plain API key has no role/permission concept; its own read_only/full scope already gates it.
  if (auth.userId && !(await hasPermissionForRoleId(auth.roleId ?? null, "leads.delete"))) {
    return NextResponse.json({ error: "You don't have permission to delete leads." }, { status: 403 });
  }

  try {
    const deleted = await LeadService.deleteLead(id, auth.userId ?? "", auth.organizationId);
    if (!deleted) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    await AuditService.log({ organizationId: auth.organizationId, userId: auth.userId ?? null, action: "lead.delete", entityType: "lead", entityId: id, metadata: { via: "api" } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id] DELETE", e, { leadId: id });
    return NextResponse.json({ error: "Could not delete lead. Please try again.", ref }, { status: 500 });
  }
}
