import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MeetingService } from "@/domains/meetings/service";
import { parseMeetingInput } from "@/domains/meetings/validation";
import { idOk, invalid, leadForApi, serializeMeeting, serverError } from "@/lib/meetingsApi";

type Ctx = { params: Promise<{ id: string }> };
const leadNotFound = () => NextResponse.json({ error: "Lead not found" }, { status: 404 });

// A lead's meetings, newest first.
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!idOk(id) || !(await leadForApi(auth, id))) return leadNotFound();
  const rows = await MeetingService.listForLead(id, auth.organizationId);
  return NextResponse.json({ data: rows.map(serializeMeeting) });
}

// Book a meeting: { mode, startAt, durationMinutes, assigneeId?, locationId? | locationName/address/mapUrl,
// meetingUrl? | autoMeet?, title?, notes?, notifyLead? }. Returns the meeting and `notice.whatsappText`
// for the app to offer a one-tap WhatsApp send.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!idOk(id) || !(await leadForApi(auth, id))) return leadNotFound();
  const p = parseMeetingInput(await req.json().catch(() => ({})));
  if (p.error) return invalid(p.error);
  if (p.data.startAt.getTime() < Date.now() - 5 * 60_000) return NextResponse.json({ error: "startAt is in the past" }, { status: 422 });
  if (p.data.mode === "online" && p.data.autoMeet && !(await MeetingService.canAutoMeet([p.data.assigneeId, auth.userId]))) {
    return NextResponse.json({ error: "No connected Google Calendar to create a Meet link — send meetingUrl instead." }, { status: 422 });
  }
  try {
    const res = await MeetingService.create({ ...p.data, leadId: id }, { userId: auth.userId ?? null, organizationId: auth.organizationId });
    return NextResponse.json({ data: serializeMeeting(res.meeting), notice: res.notice }, { status: 201 });
  } catch (e) {
    return serverError("api/v1/leads/[id]/meetings POST", e);
  }
}
