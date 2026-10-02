import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { issueMobileSession } from "@/lib/mobileSession";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { retireMobileToken } from "@/lib/mobileRevocation";

// A fresh 30-day token for a signed-in phone, so active users aren't signed out every month.
// The app calls this when its token is a week old; the old token simply runs out.
export async function POST(req: NextRequest) {
  const auth = await authorizeApiRequest(req);
  if ("error" in auth) return auth.error;
  if (!auth.userId) return NextResponse.json({ error: "A user session is required" }, { status: 403 });
  const res = await issueMobileSession(auth.userId);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  // The old token retires shortly after the new one is issued (rotation), so refresh can't chain forever on a leaked token.
  const old = verifyMobileToken((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  if (old) await retireMobileToken(old);
  return NextResponse.json(res.session);
}
