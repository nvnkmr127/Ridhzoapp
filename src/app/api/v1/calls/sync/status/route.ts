import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { getCallSyncStatus } from "@/domains/leads/callSync";

export async function GET(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });

  try {
    const status = await getCallSyncStatus(auth.userId);
    return NextResponse.json({ data: status });
  } catch (e) {
    const { logError } = await import("@/lib/log");
    const ref = logError("api/v1/calls/sync/status", e);
    return NextResponse.json({ error: "Could not fetch call sync status.", ref }, { status: 500 });
  }
}
