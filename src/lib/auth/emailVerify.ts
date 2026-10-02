import crypto from "crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { emailVerifications, users } from "@/db/schema";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";

export const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

// Which of the three extra logins a phone-registered account still lacks.
export function setupStatus(u: { email: string | null; emailVerifiedAt: Date | null; passwordSet: boolean; googleLinkedAt: Date | null; signupMethod: string | null }) {
  const email = !isPlaceholderEmail(u.email) && !!u.emailVerifiedAt;
  const status = { email, password: u.passwordSet, google: !!u.googleLinkedAt };
  const done = Object.values(status).filter(Boolean).length;
  return { ...status, done, eligible: u.signupMethod === "phone" && done < 3 };
}

// Link clicked: make the address this account's login. The phone account stays the account; we only
// replace its placeholder email. Returns the new email, or why it can't be used.
export async function consumeEmailVerification(rawToken: string): Promise<{ ok: true; email: string } | { ok: false; reason: "invalid" | "taken" | "has-email" }> {
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(and(eq(emailVerifications.tokenHash, hashToken(rawToken)), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, new Date())))
    .limit(1);
  if (!row) return { ok: false, reason: "invalid" };

  const [me] = await db.select({ email: users.email }).from(users).where(and(eq(users.id, row.userId), isNull(users.deletedAt))).limit(1);
  if (!me) return { ok: false, reason: "invalid" };
  if (me.email === row.email) {
    // Same address the account already has (signup / resend flow): this click IS the proof.
    await db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
      await tx.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, row.id));
    });
    return { ok: true, email: row.email };
  }
  if (!isPlaceholderEmail(me.email)) return { ok: false, reason: "has-email" };

  const [clash] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, row.email), ne(users.id, row.userId))).limit(1);
  if (clash) return { ok: false, reason: "taken" };

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ email: row.email, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId));
      await tx.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.userId, row.userId));
    });
  } catch {
    return { ok: false, reason: "taken" }; // unique(email) lost a race
  }
  return { ok: true, email: row.email };
}

// Accounts created BEFORE this instant are grandfathered (they never had to verify); everyone after must prove
// the address before the risky features open. Override with EMAIL_VERIFY_ENFORCE_FROM (ISO date).
const ENFORCE_FROM = () => new Date(process.env.EMAIL_VERIFY_ENFORCE_FROM || "2026-10-03T00:00:00Z").getTime();

export const EMAIL_UNVERIFIED_MESSAGE = "Verify your email address first — we sent a link when you signed up (you can resend it from the banner at the top of the page).";

// null = fine; otherwise why this person can't yet send messages / export / mint API keys / invite people.
// Exempt: phone sign-ups (the number was proven by OTP), Google sign-ins (Google proved the address),
// invited members (they accepted a link mailed to that address) and pre-existing accounts.
export async function emailGate(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt, googleLinkedAt: users.googleLinkedAt, signupMethod: users.signupMethod, createdAt: users.createdAt, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u ? emailGateFor(u) : null;
}

// Pure form of the rule, for callers that already loaded the user row (the dashboard layout).
export function emailGateFor(u: { emailVerifiedAt: Date | null; googleLinkedAt: Date | null; signupMethod: string | null; createdAt: Date; email: string | null }): string | null {
  if (u.emailVerifiedAt || u.googleLinkedAt || u.signupMethod === "phone" || isPlaceholderEmail(u.email)) return null;
  if (u.createdAt.getTime() < ENFORCE_FROM()) return null;
  return EMAIL_UNVERIFIED_MESSAGE;
}

// Mails a one-time link (24 h) to the account's own address; clicking it sets emailVerifiedAt.
export async function issueEmailVerification(userId: string, email: string, firstName?: string | null) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  await db.delete(emailVerifications).where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt)));
  await db.insert(emailVerifications).values({ userId, email, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  const [{ sendEmail, appUrl }, { mh, mp, mbtn, mfine, mkey, mtag }] = await Promise.all([import("@/lib/mail/mailer"), import("@/lib/mail/layout")]);
  const link = appUrl(`/verify-email/${rawToken}`);
  const safeName = (firstName ?? "").replace(/[&<>"']/g, "");
  await sendEmail({
    from: "noreply",
    to: email,
    subject: "Verify your email for Ridhzo",
    preheader: "Confirm this address to unlock sending, exports and API keys",
    html:
      mtag("Account") +
      mh("Verify your email.") +
      mp(safeName ? `Hi ${safeName},` : "Hello,") +
      mp("Confirm this is your address to unlock sending messages, exporting leads and API keys. The link works once, for 24 hours.") +
      mbtn("Verify email", link) +
      mkey("Button not working? Paste this link", link) +
      mfine("Didn't create a Ridhzo account? Ignore this email."),
  });
}
