import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, desc, eq, isNull, ilike, or, sql } from "drizzle-orm";
import { LeadService } from "@/domains/leads/service";
import { CustomFieldService, FieldValidationError } from "@/domains/customFields/service";
import { PlanService } from "@/domains/billing/planService";
import { authorizeApiRequest, type ApiAuth } from "@/lib/apiAuth";
import { withIdempotency } from "@/lib/idempotency";
import { canEditLeads, idOk, readOnly } from "@/lib/meetingsApi";

const authorize = authorizeApiRequest;

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const search = (sp.get("search") || "").trim();
  const status = (sp.get("status") || "").trim();

  // Recycle bin: the soft-deleted leads, most-recently-deleted first.
  if (sp.get("deleted") === "1") {
    const { hasPermissionForRoleId } = await import("@/lib/rbac");
    if (auth.userId && !(await hasPermissionForRoleId(auth.roleId ?? null, "leads.delete"))) {
      return NextResponse.json({ error: "You don't have permission to view the recycle bin." }, { status: 403 });
    }
    const deleted = await LeadService.listDeletedLeads(auth.organizationId);
    return NextResponse.json({
      data: deleted.map((l) => ({
        id: l.id, name: l.name, email: l.email, phone: l.phone, company: l.company,
        status: l.status, createdAt: l.createdAt, deletedAt: l.deletedAt, daysLeft: l.daysLeft,
      })),
    });
  }

  if (sp.get("sync") === "1") return changesFeed(auth, sp.get("after"), limit);

  const where = [eq(leads.organizationId, auth.organizationId), isNull(leads.deletedAt)];
  if (auth.userId) {
    const { hasPermissionForRoleId } = await import("@/lib/rbac");
    const isAdmin = await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage");
    if (!isAdmin) {
      where.push(eq(leads.ownerId, auth.userId));
    }
  }
  if (status) where.push(eq(leads.status, status));
  // "Mine" for admins, who otherwise see the whole workspace.
  if (auth.userId && sp.get("owner") === "me") where.push(eq(leads.ownerId, auth.userId));
  // Keyset paging: rows after the last lead the client has (newest-first). Unlike offset, new leads
  // arriving while someone scrolls don't shift pages into duplicates or gaps. Offset still works.
  const cursor = sp.get("cursor");
  if (cursor) {
    if (!idOk(cursor)) return NextResponse.json({ error: "Invalid cursor" }, { status: 422 });
    where.push(sql`(${leads.createdAt}, ${leads.id}) < (select c.created_at, c.id from leads c where c.id = ${cursor})`);
  }
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
      ownerId: leads.ownerId,
      score: leads.score,
      lastContactedAt: leads.lastContactedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(and(...where))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(limit)
    .offset(cursor ? 0 : offset);

  return NextResponse.json({ data: rows });
}

// Incremental sync for the phone's offline store: every lead changed after `after` ("<iso>|<id>" from
// the previous page's `next`; none = from the start), oldest change first. Soft-deleted leads and
// leads this rep no longer owns come back as { id, gone: true } so the phone drops its copy.
// ponytail: hard-purged leads (30 days in the recycle bin) never appear — the app re-pulls everything
// when its last sync is older than that.
async function changesFeed(auth: ApiAuth, after: string | null, limit: number) {
  const [afterAt, afterId] = (after ?? "").split("|");
  if (after && (!afterAt || Number.isNaN(Date.parse(afterAt)) || !idOk(afterId))) {
    return NextResponse.json({ error: "Invalid after" }, { status: 422 });
  }
  const { canSeeAllLeads } = await import("@/lib/meetingsApi");
  const { CustomFieldService } = await import("@/domains/customFields/service");
  const [all, defs] = await Promise.all([canSeeAllLeads(auth), CustomFieldService.listCached(auth.organizationId)]);
  // sync_at: stamped (ms, UTC) by a trigger on every write to the row — see migration 0080.
  const where = [eq(leads.organizationId, auth.organizationId)];
  if (after) {
    const iso = new Date(afterAt).toISOString().replace("Z", ""); // sync_at is naive UTC
    where.push(sql`(${leads.syncAt}, ${leads.id}) > (${iso}::timestamp, ${afterId}::uuid)`);
  }
  const rows = await db.select().from(leads).where(and(...where)).orderBy(leads.syncAt, leads.id).limit(limit);

  const hidden = new Set(["_aiRecap", "_enrichment", "_scoreFactors", ...(all ? [] : defs.filter((d) => d.adminOnly).map((d) => d.key))]);
  const data = rows.map((l) => {
    if (l.deletedAt || (!all && l.ownerId !== auth.userId)) return { id: l.id, updatedAt: l.updatedAt, gone: true };
    const customData = Object.fromEntries(Object.entries((l.customData as Record<string, unknown>) ?? {}).filter(([k]) => !hidden.has(k)));
    return { ...l, customData, gone: false };
  });
  const last = rows[rows.length - 1];
  return NextResponse.json({ data, next: last ? `${last.syncAt.toISOString()}|${last.id}` : after, done: rows.length < limit });
}

const createSchema = z.object({
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

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  if (!(await canEditLeads(auth))) return readOnly();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsed.error.issues }, { status: 422 });
  }

  // Leads created offline are sent with an Idempotency-Key: a retry after a lost response gets the
  // first lead back instead of creating a second one.
  return withIdempotency(req, auth, "leads:create", () => createLead(auth, parsed.data));
}

async function createLead(auth: ApiAuth, data: z.infer<typeof createSchema>) {
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
