import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyGoogleCode } from "@/lib/mobileAuth";
import { issueMobileSession } from "@/lib/mobileSession";
import { RateLimiter } from "@/lib/rate-limit";

const schema = z.object({ code: z.string().min(1).max(2000), verifier: z.string().min(43).max(128) });

// Final step of mobile Google sign-in: { code, verifier } → { token, user }.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!(await RateLimiter.checkLimit(`auth:google:exchange:${ip}`, 20, 60)).success) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  const userId = verifyGoogleCode(parsed.data.code, parsed.data.verifier);
  if (!userId) return NextResponse.json({ error: "Sign-in expired. Please try again." }, { status: 401 });

  const res = await issueMobileSession(userId);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.session);
}
