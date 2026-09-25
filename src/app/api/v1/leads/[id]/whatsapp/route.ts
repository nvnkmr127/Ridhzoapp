import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";

const schema = z
  .object({
    body: z.string().trim().max(4096).optional(),
    templateName: z.string().trim().max(255).optional(),
    variables: z.array(z.string().max(1024)).max(20).optional(),
  })
  .refine((v) => v.body || v.templateName, { message: "Enter a message or choose a template to send." });

// Send through the WhatsApp Business API (workspaces in "bsp" mode). Free text only inside the 24h
// window; otherwise pass an approved templateName. Personal-mode workspaces use wa.me + /contact.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid message" }, { status: 422 });

  try {
    const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");
    const result = await WhatsAppService.send({ leadId: id, ...parsed.data, userId: auth.userId ?? undefined });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e: any) {
    // Business-rule failures (outside the 24h window, not configured, no phone) are the rep's to fix.
    const msg = String(e?.message ?? "");
    if (/window|template|configured|phone|mode/i.test(msg)) return NextResponse.json({ error: msg }, { status: 422 });
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/whatsapp", e, { leadId: id });
    return NextResponse.json({ error: "Could not send the WhatsApp message.", ref }, { status: 500 });
  }
}
