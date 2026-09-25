import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sequenceEnrollments } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, idOk, leadForApi, readOnly } from "@/lib/meetingsApi";
import { SequenceService } from "@/domains/leads/sequenceService";

// Pause / resume / stop a lead's sequence: { action }.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const notFound = () => NextResponse.json({ error: "Sequence enrollment not found" }, { status: 404 });
  if (!idOk(id)) return notFound();
  const [en] = await db.select({ leadId: sequenceEnrollments.leadId }).from(sequenceEnrollments).where(eq(sequenceEnrollments.id, id)).limit(1);
  if (!en || !(await leadForApi(auth, en.leadId))) return notFound();
  if (!(await canEditLeads(auth))) return readOnly();
  const parsed = z.object({ action: z.enum(["pause", "resume", "stop"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "action must be pause, resume or stop" }, { status: 422 });

  const { action } = parsed.data;
  if (action === "pause") {
    const r = await SequenceService.pause(auth.organizationId, id);
    return r.paused ? NextResponse.json({ data: r }) : NextResponse.json({ error: "Only a running sequence can be paused." }, { status: 422 });
  }
  if (action === "resume") {
    const r = await SequenceService.resume(auth.organizationId, id);
    return r.resumed ? NextResponse.json({ data: { nextRunAt: r.nextRunAt ?? null } }) : NextResponse.json({ error: "This sequence isn't paused." }, { status: 422 });
  }
  return NextResponse.json({ data: await SequenceService.stop(auth.organizationId, id) });
}
