import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { issueMobileSession } from "@/lib/mobileSession";

// A fresh 30-day token for a signed-in phone, so active users aren't signed out every month.
// The app calls this when its token is a week old; the old token simply runs out.
export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const res = await issueMobileSession(auth.userId);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.session);
}
