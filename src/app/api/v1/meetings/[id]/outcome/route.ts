import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MeetingService } from "@/domains/meetings/service";
import { parseOutcomeInput } from "@/domains/meetings/validation";
import { canEditLeads, readOnly, invalid, meetingForApi, notFound, serializeMeeting, serverError } from "@/lib/meetingsApi";

// Record what happened: { status: "completed" | "no_show" | "cancelled", outcome?, nextFollowUpAt?, notifyLead? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const m = await meetingForApi(auth, (await params).id);
  if (!m) return notFound();
  if (!(await canEditLeads(auth))) return readOnly(); // Viewers can see meetings, not close them
  const p = parseOutcomeInput(await req.json().catch(() => ({})));
  if (p.error) return invalid(p.error);
  try {
    const res = await MeetingService.setOutcome(m.id, p.data, { userId: auth.userId ?? null, organizationId: auth.organizationId });
    if (!res) return notFound();
    return NextResponse.json({ data: serializeMeeting(res.meeting), notice: res.notice });
  } catch (e) {
    return serverError("api/v1/meetings/[id]/outcome POST", e);
  }
}
