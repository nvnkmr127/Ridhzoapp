import { NextRequest, NextResponse } from "next/server";
import { verifyMobileToken } from "@/lib/mobileAuth";
import { revokeMobileToken } from "@/lib/mobileRevocation";

// Sign-out on the phone: this token stops working now, not in 30 days. Always 200 — an already
// expired or invalid token is signed out either way.
export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = verifyMobileToken(header.startsWith("Bearer ") ? header.slice(7) : "");
  if (token) await revokeMobileToken(token);
  return NextResponse.json({ ok: true });
}
