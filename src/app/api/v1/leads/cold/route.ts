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
  const rows = await StaleLeadReclamationService.detectStaleLeads(auth.organizationId, days, isAdmin ? undefined : auth.userId);
  return NextResponse.json({ data: rows.sort((a, b) => b.daysInactive - a.daysInactive), days });
}
