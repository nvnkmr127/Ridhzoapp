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

const idSchema = z.guid();

// Lead detail: lead + activity timeline + this lead's follow-ups.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid lead ID format. Expected a valid UUID." }, { status: 400 });
  }

  const lead = await LeadService.getLead(id, auth.organizationId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (auth.userId) {
    const isAdmin = await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage");
    if (!isAdmin && lead.ownerId !== auth.userId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
  }

  const activities = await ActivityService.getLeadActivities(id);
  const fus = await db
    .select({ id: followUps.id, title: followUps.title, type: followUps.type, status: followUps.status, dueAt: followUps.dueAt })
    .from(followUps)
    .where(eq(followUps.leadId, id))
    .orderBy(asc(followUps.dueAt));

  const { TagService } = await import("@/domains/tags/service");
  const tags = await TagService.getForLead(id);

  return NextResponse.json({
    data: {
      lead,
      activities: activities.map((a) => ({ id: a.id, type: a.type, content: a.content, createdAt: a.createdAt })),
      followUps: fus,
      tags,
    },
  });
}

const patchSchema = z
  .object({
    status: z.string().min(1).optional(),
    ownerId: z.guid().nullable().optional(),
    // Contact-field edits (used by the mobile "Edit lead" screen).
    name: z.string().min(1).max(255).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(50).optional().or(z.literal("")),
    company: z.string().max(255).optional().or(z.literal("")),
    customData: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.ownerId !== undefined ||
      v.name !== undefined ||
      v.email !== undefined ||
      v.phone !== undefined ||
      v.company !== undefined ||
      v.customData !== undefined,
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

  const currentLead = await LeadService.getLead(id, auth.organizationId);
  if (!currentLead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (auth.userId) {
    const isAdmin = await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage");
    if (!isAdmin && currentLead.ownerId !== auth.userId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
  }

  try {
    const { name, email, phone, company } = parsed.data;
    if (name !== undefined || email !== undefined || phone !== undefined || company !== undefined) {
      const updated = await LeadService.updateLead(
        id,
        {
          ...(name !== undefined ? { name } : {}),
          ...(email !== undefined ? { email: email || undefined } : {}),
          ...(phone !== undefined ? { phone: phone || undefined } : {}),
          ...(company !== undefined ? { company: company || undefined } : {}),
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
      const merged = { ...((current.customData as Record<string, unknown>) ?? {}), ...parsed.data.customData };
      let clean: Record<string, unknown>;
      try {
        clean = await CustomFieldService.validate(auth.organizationId, merged);
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || "Invalid custom field value" }, { status: 422 });
      }
      await LeadService.updateCustomData(id, clean, auth.organizationId);
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
    if (parsed.data.status !== undefined) {
      await LeadService.changeStatus(id, parsed.data.status, auth.userId ?? null, auth.organizationId);
    }
    const lead = await LeadService.getLead(id, auth.organizationId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ data: lead });
  } catch (e) {
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
