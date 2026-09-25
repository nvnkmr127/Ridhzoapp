import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { FollowUpService } from "@/domains/follow-ups/service";
import { canEditLeads, leadForApi, leadNotFound, readOnly } from "@/lib/meetingsApi";

const schema = z.object({
  title: z.string().trim().min(1).max(255),
  dueAt: z.string().datetime(),
  type: z.enum(["follow_up", "task"]).optional(),
  description: z.string().optional(),
});

// Schedule a follow-up / task on a lead.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const { id } = await params;
  if (!(await leadForApi(auth, id))) return leadNotFound();
  if (!(await canEditLeads(auth))) return readOnly();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 422 });

  try {
    const followUp = await FollowUpService.createFollowUp({
      leadId: id,
      type: parsed.data.type ?? "follow_up",
      title: parsed.data.title,
      description: parsed.data.description,
      dueAt: new Date(parsed.data.dueAt),
      userId: auth.userId,
      organizationId: auth.organizationId,
    });
    return NextResponse.json({ data: followUp }, { status: 201 });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/follow-ups POST", e, { leadId: id });
    return NextResponse.json({ error: "Could not schedule follow-up. Please try again.", ref }, { status: 500 });
  }
}
