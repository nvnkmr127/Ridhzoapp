"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { ok, fail } from "@/lib/actions/result";
import { verifyPhoneOtp } from "@/lib/auth/phoneOtp";
import { GOOGLE_LINK_COOKIE, GOOGLE_LINK_TTL_SEC, isPlaceholderEmail, makeGoogleLinkToken } from "@/lib/auth/googleLink";
import { RateLimiter } from "@/lib/rate-limit";

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

// Set or change the password from the profile. Asks for the current one unless the account only has the
// random hash from a Google/WhatsApp signup (passwordSet = false).
export async function changePasswordAction(input: { currentPassword?: string; newPassword: string }) {
  const session = await requireAuth();
  const newPassword = input.newPassword ?? "";
  if (newPassword.length < 6 || newPassword.length > 72) {
    return fail("VALIDATION", "Password must be 6 to 72 characters.", { newPassword: "6 to 72 characters" });
  }

  const [me] = await db
    .select({ email: users.email, passwordHash: users.passwordHash, passwordSet: users.passwordSet })
    .from(users)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);
  if (!me) return fail("NOT_FOUND", "Account not found.");
  // Password login is by email, so a WhatsApp-only account needs a real email (Connect Google) first.
  if (isPlaceholderEmail(me.email)) return fail("VALIDATION", "Connect Google first so you have an email to log in with.");

  if (me.passwordSet) {
    const limit = await RateLimiter.checkLimit(`auth:change-password:${session.user.id}`, 5, 15 * 60);
    if (!limit.success) return fail("RATE_LIMIT", "Too many attempts. Try again in 15 minutes.");
    if (!(await bcrypt.compare(input.currentPassword ?? "", me.passwordHash))) {
      return fail("VALIDATION", "Current password is wrong.", { currentPassword: "Wrong password" });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, passwordSet: true, updatedAt: new Date() }).where(eq(users.id, session.user.id));
  return ok({ changed: true });
}
