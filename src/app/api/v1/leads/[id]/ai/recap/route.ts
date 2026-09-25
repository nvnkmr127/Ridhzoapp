import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { leadForApi, leadNotFound } from "@/lib/meetingsApi";
import { recapForLead } from "@/lib/ai/leadAssist";
import { RateLimiter } from "@/lib/rate-limit";

// One-glance AI summary of where this lead stands. Cached on the lead until it changes; ?refresh=1
// regenerates (one AI credit).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const lead = await leadForApi(auth, id);
  if (!lead) return leadNotFound();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (refresh && !(await RateLimiter.checkLimit(`apiv1:ai:${auth.userId ?? auth.organizationId}`, 20, 60)).success) {
    return NextResponse.json({ error: "Too many AI requests. Please wait a minute." }, { status: 429 });
  }

  try {
    return NextResponse.json({ data: await recapForLead(lead, auth.organizationId, refresh) });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/ai/recap", e, { leadId: id });
    return NextResponse.json({ error: "Could not load the summary.", ref }, { status: 500 });
  }
}
