import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, readOnly } from "@/lib/meetingsApi";
import { syncDeviceCalls } from "@/domains/leads/callSync";

const schema = z.object({
  calls: z
    .array(
      z.object({
        externalRef: z.string().trim().min(1).max(100),
        number: z.string().trim().min(1).max(40),
        direction: z.enum(["outgoing", "incoming"]),
        startedAt: z.iso.datetime({ offset: true }),
        durationSec: z.number().int().min(0).max(86_400),
      }),
    )
    .max(200),
});

// Android call-log sync (opt-in in the app): the rep's recent calls; the ones with their leads are
// logged on each lead's timeline, the rest are discarded unread. Idempotent per call.
export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  if (!(await canEditLeads(auth))) return readOnly();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 422 });

  try {
    const { calls } = parsed.data;
    const res = await syncDeviceCalls({
      organizationId: auth.organizationId,
      userId: auth.userId,
      calls: calls.map((c) => ({ ...c, startedAt: new Date(c.startedAt) })),
      canOpen: async (leadId) => !!(await leadForApi(auth, leadId)),
    });
    return NextResponse.json({ data: { received: calls.length, ...res } });
  } catch (e) {
    // No request details in the log: the body is the rep's personal call history.
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/calls/sync", e);
    return NextResponse.json({ error: "Could not sync calls. Please try again.", ref }, { status: 500 });
  }
}
