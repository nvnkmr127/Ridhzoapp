"use server";

import { cookies } from "next/headers";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { ok, fail } from "@/lib/actions/result";
import { verifyPhoneOtp } from "@/lib/auth/phoneOtp";
import { GOOGLE_LINK_COOKIE, GOOGLE_LINK_TTL_SEC, makeGoogleLinkToken } from "@/lib/auth/googleLink";

// Step 1 of "Connect Google": remember who is linking; the client then starts the Google sign-in and
// the signIn callback in lib/auth.ts attaches the Google email to this user.
export async function startGoogleLinkAction() {
  const session = await requireAuth();
  (await cookies()).set(GOOGLE_LINK_COOKIE, makeGoogleLinkToken(session.user.id), {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GOOGLE_LINK_TTL_SEC,
  });
  return ok({ started: true });
}

// "Add WhatsApp number": the OTP was sent with purpose "link"; verify it and attach the number.
export async function linkPhoneAction(input: { phone: string; otp: string }) {
  const session = await requireAuth();
  const phone = input.phone.trim();
  if (!phone.startsWith("+") || phone.replace(/\D/g, "").length < 6) {
    return fail("VALIDATION", "Please enter a valid mobile number.");
  }
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), ne(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);
  if (taken) return fail("CONFLICT", "This number is already used by another Ridhzo account.");

  const result = await verifyPhoneOtp(phone, input.otp);
  if (result === "locked") return fail("VALIDATION", "Too many wrong attempts. Tap Resend to get a new code.");
  if (result !== "ok") return fail("VALIDATION", "Invalid or expired OTP. Please try again.");

  await db.update(users).set({ phone, updatedAt: new Date() }).where(eq(users.id, session.user.id));
  return ok({ phone });
}
