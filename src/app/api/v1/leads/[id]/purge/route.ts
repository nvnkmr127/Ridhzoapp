import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { LeadService } from "@/domains/leads/service";
import { AuditService } from "@/domains/audit/service";
import { hasPermissionForRoleId } from "@/lib/rbac";

const idSchema = z.guid();

// Permanently delete a lead that's already in the recycle bin (the web "Delete forever").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });

  // leads.purge is admin-only by default — same gate as the web action. API keys have no role.
  if (!auth.userId || !(await hasPermissionForRoleId(auth.roleId ?? null, "leads.purge"))) {
    return NextResponse.json({ error: "You don't have permission to delete leads permanently." }, { status: 403 });
  }

  try {
    const purged = await LeadService.purgeLead(id, auth.organizationId);
    if (!purged) return NextResponse.json({ error: "This lead is no longer in the recycle bin." }, { status: 404 });
    await AuditService.log({ organizationId: auth.organizationId, userId: auth.userId, action: "lead.purge", entityType: "lead", entityId: id, metadata: { via: "api" } });
    return NextResponse.json({ data: { purged: true } });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/purge", e, { leadId: id });
    return NextResponse.json({ error: "Could not delete the lead. Please try again.", ref }, { status: 500 });
  }
}
