import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canSeeAllLeads } from "@/lib/meetingsApi";
import { callerDirectory } from "@/domains/leads/callSync";
import { getOrgFormat } from "@/lib/format.server";

// Caller ID (Android, opt-in): name + "Interested · ₹1.5L" for every lead this user may open, keyed by
// the last 8 digits of the number. The app keeps it on the phone so an incoming call from a lead shows
// who it is even with the app closed. Read-only roles get it too — seeing who's calling isn't an edit.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });

  const [fmt, all] = await Promise.all([getOrgFormat(auth.organizationId), canSeeAllLeads(auth)]);
  const data = await callerDirectory(auth.organizationId, all ? null : auth.userId, fmt);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
