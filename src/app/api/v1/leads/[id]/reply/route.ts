import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { withIdempotency } from "@/lib/idempotency";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { recordLeadReply } from "@/domains/leads/contactLog";

const schema = z.object({
  channel: z.enum(["whatsapp", "email", "call"]).default("whatsapp"),
  message: z.string().trim().min(1, "Paste or type what they said.").max(4000),
});

// "They replied": the rep pastes the lead's reply from their own WhatsApp/mail. Logged as inbound and
// stops any running sequence, like a Business API inbound message would.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const userId = auth.userId;
  if (!userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  // Offline retries from the app carry an Idempotency-Key: log once, replay the first response.
  return withIdempotency(req, auth, `reply:${id}`, async () => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Paste or type what they said." }, { status: 422 });
    }

    try {
      await recordLeadReply({ leadId: id, userId, ...parsed.data });
      return NextResponse.json({ data: { logged: true } }, { status: 201 });
    } catch (e) {
      const { logError } = await import("@/lib/log");
      const ref = logError("api/v1/leads/[id]/reply", e, { leadId: id });
      return NextResponse.json({ error: "Could not save the reply. Please try again.", ref }, { status: 500 });
    }
  });
}
