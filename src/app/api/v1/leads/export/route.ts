import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { exportLeadsCsvCore, exportSchema } from "@/lib/leads/exportCore";

// CSV of the caller's leads for the app's "Export" (same rules, permission and monthly export quota as
// the web). Returns { csv, count } — the app saves and shares the file.
export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  if (!(await hasPermissionForRoleId(auth.roleId ?? null, "leads.export"))) {
    return NextResponse.json({ error: "You don't have permission to export leads. Ask an admin." }, { status: 403 });
  }
  const parsed = exportSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Couldn't read the export options." }, { status: 422 });
  const isAdmin = await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage");
  const res = await exportLeadsCsvCore({ userId: auth.userId, organizationId: auth.organizationId, isAdmin }, parsed.data);
  if (!res.ok) {
    const status = res.code === "FORBIDDEN" ? 403 : res.code === "VALIDATION" ? 422 : res.code === "LIMIT" || res.code === "RATE_LIMIT" ? 429 : 400;
    return NextResponse.json({ error: res.message }, { status });
  }
  return NextResponse.json({ data: res.data });
}
