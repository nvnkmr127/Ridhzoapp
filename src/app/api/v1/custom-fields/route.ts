import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { CustomFieldService } from "@/domains/customFields/service";

// The org's custom-field definitions, so mobile can render typed inputs for a lead's customData.
// Same visibility as the web forms: disabled fields are never returned, admin-only ones only to
// admins (API keys act as admin, as on the lead routes).
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const isAdmin = !auth.userId || (await hasPermissionForRoleId(auth.roleId ?? null, "settings.manage"));
  const defs = await CustomFieldService.list(auth.organizationId);
  return NextResponse.json({ data: defs.filter((d) => !d.disabled && (isAdmin || !d.adminOnly)) });
}
