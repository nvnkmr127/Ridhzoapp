import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { canEditLeads, leadForApi, readOnly } from "@/lib/meetingsApi";
import { syncDeviceCalls, getCallSyncStatus } from "@/domains/leads/callSync";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

// Android call-log sync (opt-in in the app): the rep's recent calls with lead numbers — the app
// filters with GET /api/v1/calls/numbers first, so personal calls are never sent. Each is logged on
// its lead's timeline (anything that doesn't match a lead is dropped unwritten). Idempotent per call.
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
    
    // Update last sync timestamp
    await db.update(users).set({ lastCallSyncAt: new Date() }).where(eq(users.id, auth.userId));
    
    // Fetch the updated status to return it
    const status = await getCallSyncStatus(auth.userId, auth.organizationId);

    if (res.logged > 0) {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/", "layout");
    }

    return NextResponse.json({ data: { received: calls.length, ...res, status } });
  } catch (e) {
    // No request details in the log: the body is the rep's personal call history.
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/calls/sync", e);
    return NextResponse.json({ error: "Could not sync calls. Please try again.", ref }, { status: 500 });
  }
}
