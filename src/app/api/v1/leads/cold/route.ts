import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { StaleLeadReclamationService } from "@/domains/leads/staleLeadReclamationService";

// "Going cold": open leads with no contact in ?days= (default 14) days — same as the web Cold Leads page.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14));
  const isAdmin = !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 500));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  // Most inactive first, sorted and bounded in SQL (was: every stale lead in one response).
  const rows = await StaleLeadReclamationService.detectStaleLeads(auth.organizationId, days, isAdmin ? undefined : auth.userId, { limit, offset });
  return NextResponse.json({ data: rows, days });
}
