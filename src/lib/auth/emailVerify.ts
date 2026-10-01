import crypto from "crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { emailVerifications, users } from "@/db/schema";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";

export const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

// Which of the three extra logins a phone-registered account still lacks.
export function setupStatus(u: { email: string; emailVerifiedAt: Date | null; passwordSet: boolean; googleLinkedAt: Date | null; signupMethod: string | null }) {
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
    await db.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, row.id));
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
