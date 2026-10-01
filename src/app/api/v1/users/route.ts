import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { UserService } from "@/domains/users/service";

// Org members — used by the app's "assign to teammate" picker.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;

  const users = await UserService.list(auth.organizationId);
  const data = users
    .filter((u: any) => u.isActive !== false)
    .map((u: any) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed",
      email: u.email,
    }));
  return NextResponse.json({ data });
}
