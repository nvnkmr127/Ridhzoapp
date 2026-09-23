import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, desc, eq, isNull, ilike, or, sql } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { CustomFieldService, FieldValidationError } from "@/domains/customFields/service";
import { PlanService } from "@/domains/billing/planService";
import { authorizeApiRequest } from "@/lib/apiAuth";

const authorize = authorizeApiRequest;

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);
  const search = (sp.get("search") || "").trim();
  const status = (sp.get("status") || "").trim();

  // Recycle bin: the soft-deleted leads, most-recently-deleted first.
  if (sp.get("deleted") === "1") {
    const deleted = await LeadService.listDeletedLeads(auth.organizationId);
    return NextResponse.json({
      data: deleted.map((l) => ({
        id: l.id, name: l.name, email: l.email, phone: l.phone, company: l.company,
        status: l.status, createdAt: l.createdAt, deletedAt: l.deletedAt, daysLeft: l.daysLeft,
      })),
    });
  }

  const where = [eq(leads.organizationId, auth.organizationId), isNull(leads.deletedAt)];
  if (auth.userId) {
    const { hasPermissionForRoleId } = await import("@/lib/rbac");
    const isAdmin = await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage");
    if (!isAdmin) {
      where.push(eq(leads.ownerId, auth.userId));
    }
  }
  if (status) where.push(eq(leads.status, status));
  if (search) {
    // Match name/email/company (case-insensitive) or phone digits, so mobile can search the
    // whole org, not just the first page it happened to load.
    const like = `%${search}%`;
    const phoneDigits = search.replace(/\D/g, "");
    const conds = [ilike(leads.name, like), ilike(leads.email, like), ilike(leads.company, like)];
    if (phoneDigits) conds.push(sql`regexp_replace(${leads.phone}, '\\D', '', 'g') ILIKE ${`%${phoneDigits}%`}`);
    where.push(or(...conds)!);
  }

  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      company: leads.company,
      status: leads.status,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(...where))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  return NextResponse.json({ data: rows });
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  company: z.string().max(255).optional().or(z.literal("")),
  customData: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsed.error.issues }, { status: 422 });
  }

  try {
    await PlanService.assertCanAddLead(auth.organizationId);
    const customData = await CustomFieldService.validate(auth.organizationId, parsed.data.customData ?? {});
    const lead = await LeadService.createLead(
      {
        name: parsed.data.name,
        email: parsed.data.email || undefined,
        phone: parsed.data.phone || undefined,
        company: parsed.data.company || undefined,
        customData,
      },
      auth.userId ?? null,
      auth.organizationId
    );
    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (e: any) {
    // Only surface intentional business messages; never echo raw exception/DB text.
    const msg = e?.message || "";
    const m = msg.toLowerCase();
    // Custom-field validation failures are user errors, not server faults.
    if (e instanceof FieldValidationError || e?.code === "VALIDATION") {
      return NextResponse.json({ error: msg }, { status: 422 });
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
