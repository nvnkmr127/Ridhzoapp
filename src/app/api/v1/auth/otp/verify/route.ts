import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizePhoneOtp } from "@/lib/auth";
import { issueMobileSession } from "@/lib/mobileSession";
import { RateLimiter } from "@/lib/rate-limit";

const schema = z.object({ phone: z.string().min(8).max(30), otp: z.string().regex(/^\d{6}$/) });

const REASONS: Record<string, string> = {
  OTP_LOCKED: "Too many wrong attempts. Request a new code.",
  ACCOUNT_DISABLED: "This account has been disabled. Contact your admin.",
  ACCOUNT_SUSPENDED: "This workspace has been suspended. Contact support.",
};

// Mobile login step 2: { phone (as returned by /otp/send), otp } → { token, user }.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!(await RateLimiter.checkLimit(`auth:otp:verify:${ip}`, 20, 10 * 60)).success) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 422 });

  let user;
  try {
    user = await authorizePhoneOtp({ phoneNumber: parsed.data.phone, otp: parsed.data.otp });
  } catch (e) {
    const msg = REASONS[(e as Error).message];
    return NextResponse.json({ error: msg ?? "Could not sign in. Try again." }, { status: msg ? 403 : 500 });
  }
  if (!user) return NextResponse.json({ error: "That code is wrong or expired." }, { status: 401 });

  const res = await issueMobileSession(user.id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.session);
}
