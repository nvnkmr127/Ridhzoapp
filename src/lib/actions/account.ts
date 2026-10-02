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
import crypto from "crypto";
import { z } from "zod";
import { emailVerifications } from "@/db/schema";
import { hashToken } from "@/lib/auth/emailVerify";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { mh, mp, mbtn, mfine, mkey, mtag } from "@/lib/mail/layout";

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

  try {
    await db.update(users).set({ phone, updatedAt: new Date() }).where(eq(users.id, session.user.id));
  } catch (e) {
    // Lost a race against another account taking the number (unique index users_phone_live_unique).
    if ((e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505") {
      return fail("CONFLICT", "This number is already used by another Ridhzo account.");
    }
    throw e;
  }
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
    .select({ email: users.email, phone: users.phone, passwordHash: users.passwordHash, passwordSet: users.passwordSet })
    .from(users)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);
  if (!me) return fail("NOT_FOUND", "Account not found.");
  // Password login is by email or phone number, so a WhatsApp-only account can set one as long as it has a number.
  if (isPlaceholderEmail(me.email) && !me.phone) return fail("VALIDATION", "Add an email or mobile number first so you have something to log in with.");

  if (me.passwordSet) {
    const limit = await RateLimiter.checkLimit(`auth:change-password:${session.user.id}`, 5, 15 * 60);
    if (!limit.success) return fail("RATE_LIMIT", "Too many attempts. Try again in 15 minutes.");
    if (!(await bcrypt.compare(input.currentPassword ?? "", me.passwordHash))) {
      return fail("VALIDATION", "Current password is wrong.", { currentPassword: "Wrong password" });
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, passwordSet: true, updatedAt: new Date() }).where(eq(users.id, session.user.id));
  // A changed password must end every session made with the old one (a stolen session is the usual
  // reason for changing it). This includes the current browser, which is asked to sign in again within a
  // minute — the same behaviour as a reset-by-email.
  try {
    const { SessionService } = await import("@/domains/platform/sessionService");
    await SessionService.revokeUserSessions(session.user.id);
  } catch (e) {
    console.warn("[change-password] session revoke failed", e);
  }
  return ok({ changed: true });
}

// "Add email" from the account-setup prompt: email a verification link. The address becomes the login
// only after the link is clicked (consumeEmailVerification), so an unverified or someone else's
// address never replaces the phone login.
export async function requestEmailVerificationAction(input: { email: string }) {
  const session = await requireAuth();
  const parsed = z.string().trim().toLowerCase().email().max(255).safeParse(input.email);
  if (!parsed.success) return fail("VALIDATION", "Please enter a valid email address.");
  const email = parsed.data;

  const limit = await RateLimiter.checkLimit(`account:email-verify:${session.user.id}`, 5, 60 * 60);
  if (!limit.success) return fail("RATE_LIMIT", "Too many attempts. Please try again in an hour.");

  const [me] = await db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt, firstName: users.firstName })
    .from(users)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);
  if (!me) return fail("NOT_FOUND", "Account not found.");
  if (!isPlaceholderEmail(me.email)) return fail("VALIDATION", "This account already has an email address.");

  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, session.user.id))).limit(1);
  if (taken) return fail("CONFLICT", "This email is already used by another Ridhzo account. Use a different one, or log in with it.");

  const rawToken = crypto.randomBytes(32).toString("hex");
  await db.delete(emailVerifications).where(and(eq(emailVerifications.userId, session.user.id), isNull(emailVerifications.usedAt)));
  await db.insert(emailVerifications).values({
    userId: session.user.id,
    email,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const link = appUrl(`/verify-email/${rawToken}`);
  const safeName = (me.firstName ?? "").replace(/[&<>"']/g, "");
  await sendEmail({
    from: "noreply",
    to: email,
    subject: "Verify your email for Ridhzo",
    preheader: "Confirm this address to log in with it",
    html:
      mtag("Account") +
      mh("Verify your email.") +
      mp(safeName ? `Hi ${safeName},` : "Hello,") +
      mp("Confirm this address to add email login to your Ridhzo account. Your account and data stay exactly as they are. The link works once, for 24 hours.") +
      mbtn("Verify email", link) +
      mkey("Button not working? Paste this link", link) +
      mfine("Didn't ask for this? Ignore this email — nothing changes."),
  });
  return ok({ sent: true, email });
}
