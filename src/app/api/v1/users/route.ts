import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { UserService } from "@/domains/users/service";
import { canSeeAllLeads } from "@/lib/meetingsApi";

// Org members — used by the app's "assign to teammate" picker.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;

  const users = await UserService.list(auth.organizationId);
  // Teammates' email addresses are for admins; everyone else gets names (enough to pick an assignee).
  const admin = await canSeeAllLeads(auth);
  const data = users
    .filter((u: any) => u.isActive !== false)
    .map((u: any) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed",
      ...(admin ? { email: u.email } : {}),
    }));
  return NextResponse.json({ data });
}
