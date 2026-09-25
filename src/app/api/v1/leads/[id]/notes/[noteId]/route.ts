import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { ActivityService } from "@/domains/activities/service";
import { canEditLeads, idOk, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

// Only notes are editable here — calls, messages and system entries stay as recorded.
async function guard(req: NextRequest, { params }: Ctx) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return { res: auth.error };
  const { id, noteId } = await params;
  if (!(await leadForApi(auth, id))) return { res: leadNotFound() };
  if (!(await canEditLeads(auth))) return { res: readOnly() };
  if (!idOk(noteId)) return { res: NextResponse.json({ error: "Note not found" }, { status: 404 }) };
  const [note] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, noteId), eq(activities.leadId, id), eq(activities.type, "note")))
    .limit(1);
  if (!note) return { res: NextResponse.json({ error: "Note not found" }, { status: 404 }) };
  return { id, noteId };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("res" in g) return g.res;
  const parsed = z.object({ content: z.string().trim().min(1).max(10000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Note cannot be empty" }, { status: 422 });
  const updated = await ActivityService.updateActivity(g.noteId, g.id, parsed.data.content);
  return updated ? NextResponse.json({ data: updated }) : NextResponse.json({ error: "Note not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("res" in g) return g.res;
  const deleted = await ActivityService.deleteActivity(g.noteId, g.id);
  return deleted ? NextResponse.json({ data: { deleted: true } }) : NextResponse.json({ error: "Note not found" }, { status: 404 });
}
