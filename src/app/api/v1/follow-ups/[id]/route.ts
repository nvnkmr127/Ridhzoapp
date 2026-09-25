import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followUps } from "@/db/schema";
import { FollowUpService } from "@/domains/follow-ups/service";
import { canEditLeads, leadForApi, readOnly } from "@/lib/meetingsApi";

const idSchema = z.guid();

const schema = z.object({
  action: z.enum(["complete", "cancel", "reschedule"]),
  dueAt: z.string().datetime().optional(),
});

// Complete / cancel / reschedule a follow-up.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid follow-up ID format. Expected a valid UUID." }, { status: 400 });
  }

  // Your own follow-up, or one on a lead you may act on (admins: any in the org).
  const [fu] = await db.select({ userId: followUps.userId, leadId: followUps.leadId }).from(followUps).where(eq(followUps.id, id)).limit(1);
  if (!fu || (auth.userId && fu.userId !== auth.userId && !(await leadForApi(auth, fu.leadId)))) {
    return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  }
  if (!(await canEditLeads(auth))) return readOnly();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 422 });

  try {
    let result;
    if (parsed.data.action === "complete") {
      result = await FollowUpService.completeFollowUp(id, auth.organizationId);
    } else if (parsed.data.action === "cancel") {
      result = await FollowUpService.cancelFollowUp(id, auth.organizationId);
    } else {
      if (!parsed.data.dueAt) return NextResponse.json({ error: "dueAt is required to reschedule" }, { status: 422 });
      result = await FollowUpService.rescheduleFollowUp(id, new Date(parsed.data.dueAt), auth.organizationId);
    }

    if (!result) {
      return NextResponse.json({ error: "Follow-up not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json({ data: result });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/follow-ups/[id]", e, { followUpId: id });
    return NextResponse.json({ error: "Could not update follow-up. Please try again.", ref }, { status: 500 });
  }
}
