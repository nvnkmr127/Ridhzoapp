import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, canSeeAllLeads, readOnly } from "@/lib/meetingsApi";
import { leadPhoneKeys } from "@/domains/leads/callSync";

// For the Android call-log sync: the phone numbers (last 8 digits) of the leads this rep may open.
// The app matches its call log against these and sends only those calls — never personal ones.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  if (!(await canEditLeads(auth))) return readOnly();

  const keys = await leadPhoneKeys(auth.organizationId, (await canSeeAllLeads(auth)) ? null : auth.userId);
  return NextResponse.json({ data: keys }, { headers: { "Cache-Control": "private, no-store" } });
}
