import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppOtpAction } from "@/lib/actions/auth";
import { RateLimiter } from "@/lib/rate-limit";

// Mobile login step 1: send a WhatsApp OTP to an existing account's number. Body: { phone }.
// Same rules as the web login (per-number 45s cooldown, unknown numbers refused); plus a per-IP cap.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!(await RateLimiter.checkLimit(`auth:otp:send:${ip}`, 10, 10 * 60)).success) {
    return NextResponse.json({ error: "Too many code requests. Please wait a few minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const res = await sendWhatsAppOtpAction({ phone: String(body?.phone ?? ""), purpose: "login" });
  if (!res.ok) {
    const status = { VALIDATION: 422, NOT_FOUND: 404, RATE_LIMIT: 429 }[res.code as string] ?? 400;
    return NextResponse.json({ error: res.message }, { status: res.code === "SERVER" ? 502 : status });
  }
  return NextResponse.json({ phone: res.data.phone });
}
