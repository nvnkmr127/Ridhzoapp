import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { leadForApi, leadNotFound } from "@/lib/meetingsApi";
import { draftReplyForLead } from "@/lib/ai/leadAssist";
import { RateLimiter } from "@/lib/rate-limit";

const schema = z.object({
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
  tone: z.enum(["friendly", "professional", "short"]).default("friendly"),
  language: z.string().trim().max(40).default("auto"),
});

// AI-written next message for this lead (uses one AI credit; falls back to a template when AI is off
// or credits are used up — `ai: false`, `outOfCredits`).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const lead = await leadForApi(auth, id);
  if (!lead) return leadNotFound();
  if (!(await RateLimiter.checkLimit(`apiv1:ai:${auth.userId ?? auth.organizationId}`, 20, 60)).success) {
    return NextResponse.json({ error: "Too many AI requests. Please wait a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 });

  try {
    return NextResponse.json({ data: await draftReplyForLead(lead, auth.organizationId, parsed.data) });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/leads/[id]/ai/draft", e, { leadId: id });
    return NextResponse.json({ error: "Could not write a draft. Please try again.", ref }, { status: 500 });
  }
}
