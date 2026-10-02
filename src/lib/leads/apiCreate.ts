import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { CustomFieldService, FieldValidationError } from "@/domains/customFields/service";
import { PlanService } from "@/domains/billing/planService";
import type { ApiAuth } from "@/lib/apiAuth";

// Shared by POST /api/v1/leads and the bulk import: one lead, with every check the single create has.
export const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  budget: z.string().max(255).optional().or(z.literal("")),
  location: z.string().max(255).optional().or(z.literal("")),
  industry: z.string().max(255).optional().or(z.literal("")),
  companySize: z.string().max(255).optional().or(z.literal("")),
  websiteUrl: z.string().max(255).optional().or(z.literal("")),
  customData: z.record(z.string(), z.unknown()).optional(),
  // "Assign to" (web Quick Add): an active teammate in this workspace; defaults to the creator.
  ownerId: z.guid().optional(),
});

export async function createLeadForApi(auth: ApiAuth, data: z.infer<typeof createSchema>) {
  const parsed = { data };
  if (parsed.data.ownerId) {
    const { users } = await import("@/db/schema");
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, parsed.data.ownerId), eq(users.organizationId, auth.organizationId), eq(users.isActive, true), isNull(users.deletedAt)))
      .limit(1);
    if (!owner) return NextResponse.json({ error: "That teammate isn't in this workspace." }, { status: 422 });
  }

  try {
    await PlanService.assertCanAddLead(auth.organizationId);
    const { hasPermissionForRoleId } = await import("@/lib/rbac");
    const isAdmin = !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));

    const rawCustom = { ...(parsed.data.customData ?? {}) };
    if (parsed.data.budget) rawCustom.budget = parsed.data.budget;
    if (parsed.data.location) rawCustom.location = parsed.data.location;
    if (parsed.data.industry) rawCustom.industry = parsed.data.industry;
    if (parsed.data.companySize) rawCustom.companySize = parsed.data.companySize;
    if (parsed.data.websiteUrl) rawCustom.websiteUrl = parsed.data.websiteUrl;

    const { withLeadFieldValues } = await import("@/lib/leads/fieldConfig");
    const customData = withLeadFieldValues(
      await CustomFieldService.validate(auth.organizationId, rawCustom, { isAdmin, isNew: true }),
      parsed.data,
    );
    const lead = await LeadService.createLead(
      {
        name: parsed.data.name,
        email: parsed.data.email || undefined,
        phone: parsed.data.phone || undefined,
        company: parsed.data.company || undefined,
        customData,
        ...(parsed.data.ownerId ? { ownerId: parsed.data.ownerId } : {}),
      },
      auth.userId ?? null,
      auth.organizationId
    );
    // Count-then-insert can be raced by a second device: if we pushed the workspace over its cap, undo ours.
    if (await PlanService.isOverLeadCap(auth.organizationId)) {
      await LeadService.deleteLead(lead.id, auth.userId ?? "", auth.organizationId).catch(() => {});
      await LeadService.purgeLead(lead.id, auth.organizationId).catch(() => {});
      return NextResponse.json({ error: "Your plan's lead limit was reached while this was being added. Upgrade to add more." }, { status: 402 });
    }
    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (e: any) {
    // Only surface intentional business messages; never echo raw exception/DB text.
    const msg = e?.message || "";
    const m = msg.toLowerCase();
    // Custom-field validation failures are user errors, not server faults.
    // `details` = { field: message } so the app can point at the exact field.
    const details = e?.fieldErrors as Record<string, string> | undefined;
    if (e instanceof FieldValidationError || e?.code === "VALIDATION") {
      return NextResponse.json({ error: msg, ...(details ? { details } : {}) }, { status: 422 });
    }
    // Duplicate email/phone found by LeadService.createLead: say which lead, on which field.
    if (details) {
      return NextResponse.json({ error: Object.values(details)[0], details }, { status: 409 });
    }
    if (m.includes("limit") || m.includes("plan")) {
      return NextResponse.json({ error: msg }, { status: 402 });
    }
    if (e?.code === "23505" || m.includes("duplicate")) {
      return NextResponse.json({ error: "A lead with this email or phone already exists." }, { status: 409 });
    }
    if (m.includes("required") || m.includes("invalid")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads POST", e);
    return NextResponse.json({ error: "Could not create lead. Please try again.", ref }, { status: 500 });
  }
}

