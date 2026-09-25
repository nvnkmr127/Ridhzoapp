import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { SequenceService } from "@/domains/leads/sequenceService";

// Enroll this lead in an automatic follow-up sequence: { sequenceId }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();
  const parsed = z.object({ sequenceId: z.guid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a sequence." }, { status: 422 });

  try {
    const res = await SequenceService.enroll(auth.organizationId, parsed.data.sequenceId, [id]);
    return NextResponse.json({ data: res }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (/not found|paused|limit|plan|already/i.test(msg)) return NextResponse.json({ error: msg }, { status: 422 });
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/sequences", e, { leadId: id });
    return NextResponse.json({ error: "Could not start the sequence.", ref }, { status: 500 });
  }
}
