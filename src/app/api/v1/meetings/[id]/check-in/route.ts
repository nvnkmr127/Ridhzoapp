import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MeetingService } from "@/domains/meetings/service";
import { coordsSchema } from "@/domains/meetings/validation";
import { meetingForApi, notFound, serializeMeeting, serverError } from "@/lib/meetingsApi";

// Field check-in from the mobile app: { lat, lng } (or {} when location isn't available).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const m = await meetingForApi(auth, (await params).id);
  if (!m) return notFound();
  const body = await req.json().catch(() => ({}));
  const parsed = coordsSchema.safeParse(body && typeof body.lat === "number" ? { lat: body.lat, lng: body.lng } : null);
  if (!parsed.success) return NextResponse.json({ error: "lat/lng out of range" }, { status: 422 });
  try {
    const res = await MeetingService.checkIn(m.id, parsed.data, { userId: auth.userId, organizationId: auth.organizationId });
    return res ? NextResponse.json({ data: serializeMeeting(res) }) : notFound();
  } catch (e) {
    return serverError("api/v1/meetings/[id]/check-in POST", e);
  }
}
