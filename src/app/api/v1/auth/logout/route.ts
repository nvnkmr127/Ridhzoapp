import { NextRequest, NextResponse } from "next/server";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { revokeMobileToken } from "@/lib/mobileRevocation";

// Sign-out on the phone: this token stops working now, not in 30 days. Always 200 — an already
// expired or invalid token is signed out either way.
export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = verifyMobileToken(header.startsWith("Bearer ") ? header.slice(7) : "");
  if (token) {
    const { evictMirroredSession } = await import("@/lib/sessionCache");
    const { clearUserAuthCache } = await import("@/lib/apiAuth");
    clearUserAuthCache(token.sub);
    await Promise.all([revokeMobileToken(token), evictMirroredSession(token.sub, token.org)]);
  }
  return NextResponse.json({ ok: true });
}
