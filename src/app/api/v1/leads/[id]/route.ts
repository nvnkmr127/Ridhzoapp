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

const idSchema = z.guid();

// Lead detail: lead + activity timeline + this lead's follow-ups.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid lead ID format. Expected a valid UUID." }, { status: 400 });
  }

  // Owner, admin, or someone attending a meeting with this lead (same rule as the web lead page).
  const lead = await leadForApi(auth, id);
  if (!lead) return leadNotFound();
  if (auth.userId && !(await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage")) && lead.customData) {
    const { CustomFieldService } = await import("@/domains/customFields/service");
    const cd = { ...(lead.customData as Record<string, unknown>) };
    for (const f of await CustomFieldService.list(auth.organizationId)) if (f.adminOnly) delete cd[f.key];
    (lead as { customData: unknown }).customData = cd;
  }

  // ponytail: newest 500 only — bounds the payload on years-old leads; page it if anyone hits the cap.
  const [activities, fus, tags] = await Promise.all([
    ActivityService.getLeadActivities(id, 500),
    db
      .select({ id: followUps.id, title: followUps.title, type: followUps.type, description: followUps.description, status: followUps.status, dueAt: followUps.dueAt })
      .from(followUps)
      .where(eq(followUps.leadId, id))
      .orderBy(asc(followUps.dueAt)),
    import("@/domains/tags/service").then(m => m.TagService.getForLead(id))
  ]);

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
        durationSec: a.durationSec
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
    customData: z.record(z.string(), z.unknown()).optional(),
    // Pipeline stage and opportunity value ("" / null clears).
    stageId: z.guid().nullable().optional().or(z.literal("")),
    expectedValue: z.string().max(30).nullable().optional(),
    // Next follow-up date (ISO) — mirrored as one pending "followup" task; null clears it.
    nextFollowUpAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.ownerId !== undefined ||
      v.name !== undefined ||
      v.email !== undefined ||
      v.phone !== undefined ||
      v.company !== undefined ||
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

  const currentLead = await leadForApi(auth, id);
  if (!currentLead) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

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
    if (parsed.data.customData !== undefined) {
      const current = await LeadService.getLead(id, auth.organizationId);
      if (!current) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const { CustomFieldService } = await import("@/domains/customFields/service");
      // A partial patch over the stored values; "" / null clears a field.
      const stored = (current.customData as Record<string, unknown>) ?? {};
      const merged = { ...stored, ...parsed.data.customData };
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
      await LeadService.updateCustomData(id, result, auth.organizationId);
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
