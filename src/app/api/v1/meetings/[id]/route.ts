import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MeetingService } from "@/domains/meetings/service";
import { parseMeetingInput } from "@/domains/meetings/validation";
import { invalid, meetingForApi, notFound, serializeMeeting, serverError } from "@/lib/meetingsApi";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const m = await meetingForApi(auth, (await params).id);
  return m ? NextResponse.json({ data: serializeMeeting(m) }) : notFound();
}

// Edit / reschedule. Send the full meeting (same fields as create). A new startAt notifies the lead
// unless notifyLead is false, and moves the calendar event.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const m = await meetingForApi(auth, (await params).id);
  if (!m) return notFound();
  const p = parseMeetingInput({ ...(await req.json().catch(() => ({}))), autoMeet: false }, true);
  if (p.error) return invalid(p.error);
  try {
    const res = await MeetingService.update(m.id, p.data, { userId: auth.userId ?? null, organizationId: auth.organizationId });
    if (!res) return notFound();
    return NextResponse.json({ data: serializeMeeting(res.meeting), notice: res.notice });
  } catch (e) {
    return serverError("api/v1/meetings/[id] PATCH", e);
  }
}
