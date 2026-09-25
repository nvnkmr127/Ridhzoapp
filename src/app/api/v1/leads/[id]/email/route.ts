import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { sendLeadEmail } from "@/domains/leads/leadActions";

const schema = z.object({ subject: z.string().trim().min(1).max(255), body: z.string().trim().min(1).max(20000) });

// Send an email from the workspace's mailer (same as the web Email tab) and log it on the timeline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  const lead = await leadForApi(auth, id);
  if (!lead) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();
  if (!lead.email) return NextResponse.json({ error: "This lead has no email address on file." }, { status: 422 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please add a subject and a message." }, { status: 422 });

  try {
    await sendLeadEmail({ leadId: id, userId: auth.userId, organizationId: auth.organizationId, to: lead.email, ...parsed.data });
    return NextResponse.json({ data: { sent: true } }, { status: 201 });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/email", e, { leadId: id });
    return NextResponse.json({ error: "Could not send the email. Check the workspace's email settings.", ref }, { status: 500 });
  }
}
