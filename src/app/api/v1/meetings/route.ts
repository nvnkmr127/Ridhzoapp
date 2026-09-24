import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { MeetingService } from "@/domains/meetings/service";
import { MEETING_MODE_KEYS, MEETING_STATUSES } from "@/domains/meetings/format";
import { canSeeAllLeads, serializeMeeting } from "@/lib/meetingsApi";

// List meetings. Query: from, to (ISO; default today-30d … today+90d), status, mode, assigneeId.
// A mobile user gets meetings they attend/booked/own the lead of; admins and API keys get the org.
export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const q = req.nextUrl.searchParams;
  const date = (v: string | null, fallback: Date) => {
    const d = v ? new Date(v) : fallback;
    return Number.isNaN(d.getTime()) ? fallback : d;
  };
  const day = 24 * 60 * 60 * 1000;
  const status = q.get("status");
  const mode = q.get("mode");
  if (status && !(status in MEETING_STATUSES)) return NextResponse.json({ error: "Unknown status" }, { status: 422 });
  if (mode && !(MEETING_MODE_KEYS as string[]).includes(mode)) return NextResponse.json({ error: "Unknown mode" }, { status: 422 });

  const all = await canSeeAllLeads(auth);
  const rows = await MeetingService.list(auth.organizationId, {
    userId: all ? undefined : auth.userId,
    assigneeId: all ? q.get("assigneeId") || undefined : undefined,
    status: status || undefined,
    mode: mode || undefined,
    from: date(q.get("from"), new Date(Date.now() - 30 * day)),
    to: date(q.get("to"), new Date(Date.now() + 90 * day)),
  });
  return NextResponse.json({
    data: rows.map((r) => ({ ...serializeMeeting(r.meeting), lead: { id: r.lead.id, name: r.lead.name, phone: r.lead.phone } })),
  });
}
