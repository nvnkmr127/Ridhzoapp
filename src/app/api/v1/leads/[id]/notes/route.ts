import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";
import { ActivityService } from "@/domains/activities/service";

const schema = z.object({ content: z.string().trim().min(1).max(5000) });

// Add a note to a lead's timeline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Note cannot be empty" }, { status: 422 });

  const activity = await ActivityService.addActivity({
    leadId: id,
    userId: auth.userId,
    type: "note",
    content: parsed.data.content,
  });

  return NextResponse.json({ data: activity }, { status: 201 });
}
