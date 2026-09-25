import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { recordLeadContact } from "@/domains/leads/contactLog";

const schema = z.object({
  channel: z.enum(["call", "whatsapp", "email"]),
  outcome: z.enum(["answered", "no_answer", "busy", "wrong_number"]).optional(),
  note: z.string().trim().max(2000).optional(),
  message: z.string().trim().max(4000).optional(),
});

// Log outreach done from the phone (a call, the rep's own WhatsApp, their mail app): timeline entry +
// last-contacted time, so SLA, cold-lead detection and scoring see it. Same as the web "Log contact".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 422 });

  try {
    await recordLeadContact({ leadId: id, userId: auth.userId, ...parsed.data });
    return NextResponse.json({ data: { logged: true } }, { status: 201 });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/contact", e, { leadId: id });
    return NextResponse.json({ error: "Could not log this contact. Please try again.", ref }, { status: 500 });
  }
}
