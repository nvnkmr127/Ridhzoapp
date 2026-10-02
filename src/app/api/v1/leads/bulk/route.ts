import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authorizeApiRequest, type ApiAuth } from "@/lib/apiAuth";
import { withIdempotency } from "@/lib/idempotency";
import { canEditLeads, leadForApi, readOnly } from "@/lib/meetingsApi";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { AuditService } from "@/domains/audit/service";
import { createLeadForApi, createSchema } from "@/lib/leads/apiCreate";

// One request instead of one per lead (the app's multi-select and phone import). Each lead goes through
// the same checks as its single-lead route and gets its own result, so one refusal doesn't sink the rest.
const MAX = 100;
const guid = z.guid();
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), ids: z.array(guid).min(1).max(MAX), status: z.string().min(1), lossReason: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("assign"), ids: z.array(guid).min(1).max(MAX), ownerId: guid.nullable() }),
  z.object({ action: z.literal("delete"), ids: z.array(guid).min(1).max(MAX) }),
  z.object({ action: z.literal("create"), leads: z.array(createSchema).min(1).max(MAX) }),
]);
type Result = { id?: string; ok: boolean; error?: string };

async function each(ids: string[], fn: (id: string) => Promise<void>): Promise<Result[]> {
  const out: Result[] = [];
  for (const id of ids) {
    try {
      await fn(id);
      out.push({ id, ok: true });
    } catch (e) {
      out.push({ id, ok: false, error: (e as Error)?.message || "Failed" });
    }
  }
  return out;
}
const refuse = (m: string) => Promise.reject(new Error(m));

async function run(auth: ApiAuth, b: z.infer<typeof body>): Promise<Result[] | NextResponse> {
  if (b.action === "create") {
    // The same monthly "imported rows" allowance the web import spends; unused units are handed back.
    const { UsageService, UsageLimitError } = await import("@/domains/billing/usageService");
    try {
      await UsageService.consume(auth.organizationId, "import_rows", b.leads.length);
    } catch (e) {
      if (e instanceof UsageLimitError) return NextResponse.json({ error: e.message, code: "limit" }, { status: 402 });
      throw e;
    }
    const out: Result[] = [];
    for (const l of b.leads) {
      const res = await createLeadForApi(auth, l);
      const j = await res.json().catch(() => ({}));
      out.push(res.ok ? { id: j?.data?.id, ok: true } : { ok: false, error: j?.error ?? "Could not create" });
      if (res.status === 402) break; // plan limit: the rest would fail the same way
    }
    const unused = b.leads.length - out.filter((r) => r.ok).length;
    if (unused > 0) await UsageService.refund(auth.organizationId, "import_rows", unused).catch(() => {});
    return out;
  }
  if (b.action === "status") {
    const { CustomStatusSchemaService } = await import("@/domains/leads/customStatusSchemaService");
    const schema = await CustomStatusSchemaService.getTenantStatusSchema(auth.organizationId);
    if (!schema.some((s) => s.key === b.status)) return NextResponse.json({ error: `Unknown status "${b.status}".` }, { status: 422 });
    return each(b.ids, async (id) => {
      if (!(await leadForApi(auth, id))) return refuse("Lead not found");
      await LeadService.changeStatus(id, b.status, auth.userId ?? null, auth.organizationId, b.lossReason || null);
    });
  }
  if (b.action === "assign") {
    if (b.ownerId) {
      const [owner] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.id, b.ownerId), eq(users.organizationId, auth.organizationId), eq(users.isActive, true), isNull(users.deletedAt))).limit(1);
      if (!owner) return NextResponse.json({ error: "That teammate isn't in this workspace." }, { status: 422 });
    }
    const { AssignmentService } = await import("@/domains/leads/assignmentService");
    return each(b.ids, async (id) => {
      if (!(await leadForApi(auth, id))) return refuse("Lead not found");
      await AssignmentService.assignLead({ leadId: id, ownerId: b.ownerId, teamId: null, assignedById: auth.userId, organizationId: auth.organizationId });
    });
  }
  // delete
  if (auth.userId && !(await hasPermissionForRoleId(auth.roleId ?? null, "leads.delete"))) {
    return NextResponse.json({ error: "You don't have permission to delete leads." }, { status: 403 });
  }
  const admin = !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));
  return each(b.ids, async (id) => {
    const lead = await LeadService.getLead(id, auth.organizationId);
    if (!lead || (auth.userId && !admin && lead.ownerId !== auth.userId)) return refuse("Lead not found");
    if (!(await LeadService.deleteLead(id, auth.userId ?? "", auth.organizationId))) return refuse("Lead not found");
    await AuditService.log({ organizationId: auth.organizationId, userId: auth.userId ?? null, action: "lead.delete", entityType: "lead", entityId: id, metadata: { via: "api-bulk" } });
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!(await canEditLeads(auth))) return readOnly();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Invalid request (at most ${MAX} leads at a time).`, details: parsed.error.issues }, { status: 422 });

  return withIdempotency(req, auth, "leads:bulk", async () => {
    const out = await run(auth, parsed.data);
    if (out instanceof NextResponse) return out;
    return NextResponse.json({ data: { results: out, ok: out.filter((r) => r.ok).length, failed: out.filter((r) => !r.ok).length } });
  });
}
