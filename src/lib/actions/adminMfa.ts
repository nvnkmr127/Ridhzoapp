"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { RateLimiter } from "@/lib/rate-limit";
import { ok, fail } from "@/lib/actions/result";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";
import { clearAdminMfa, grantAdminMfa } from "@/lib/auth/adminMfa";
import { AuditService } from "@/domains/audit/service";

// Platform-operator two-factor. These run for a signed-in super-admin who has NOT yet stepped up, so
// they use requireAuth + their own isSuperAdmin check rather than requireSuperAdmin.
async function operator() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new Error("Forbidden");
  const [u] = await db
    .select({ id: users.id, email: users.email, phone: users.phone, secret: users.totpSecret, enabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!u) throw new Error("Forbidden");
  return u;
}

const ZERO_ORG = "00000000-0000-0000-0000-000000000000";

export async function adminMfaStatusAction() {
  const u = await operator();
  return { enrolled: !!u.enabledAt };
}

// Step 1 of enrolment: mint a secret (stored encrypted, NOT yet active) and return it for the authenticator.
// Refused once enrolled — resetting a lost device is an operator-with-database-access job (admin:reset-mfa).
export async function beginAdminMfaEnrollAction() {
  const u = await operator();
  if (u.enabledAt) return fail("CONFLICT", "Two-factor is already set up for this account.");
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecret: encryptSecret(secret) }).where(eq(users.id, u.id));
  return ok({ secret, uri: otpauthUrl(secret, u.email ?? u.phone ?? u.id) });
}

async function checkCode(userId: string, secret: string, code: string) {
  const limit = await RateLimiter.checkLimit(`admin-mfa:${userId}`, 5, 10 * 60);
  if (!limit.success) return fail("RATE_LIMIT", "Too many attempts. Wait a few minutes.");
  if (!verifyTotp(secret, String(code ?? ""))) return fail("VALIDATION", "That code is wrong or expired.");
  return null;
}

// Step 2: prove the authenticator works, then turn it on and open the step-up window.
export async function confirmAdminMfaEnrollAction(code: string) {
  const u = await operator();
  if (u.enabledAt || !u.secret) return fail("CONFLICT", "Start setup again.");
  const secret = readSecret(u.secret);
  if (!secret) return fail("SERVER", "Start setup again.");
  const bad = await checkCode(u.id, secret, code);
  if (bad) return bad;
  await db.update(users).set({ totpEnabledAt: new Date() }).where(eq(users.id, u.id));
  await grantAdminMfa(u.id);
  await AuditService.log({ organizationId: ZERO_ORG, userId: u.id, action: "security.admin_mfa_enrolled", entityType: "user", entityId: u.id });
  return ok({ verified: true });
}

// Each platform session (every 2 h): enter the current code to unlock /admin and platform actions.
export async function verifyAdminMfaAction(code: string) {
  const u = await operator();
  if (!u.enabledAt || !u.secret) return fail("VALIDATION", "Set up two-factor first.");
  const secret = readSecret(u.secret);
  if (!secret) return fail("SERVER", "Two-factor secret is unreadable. Ask another operator to reset it.");
  const bad = await checkCode(u.id, secret, code);
  if (bad) {
    await AuditService.log({ organizationId: ZERO_ORG, userId: u.id, action: "security.admin_mfa_failed", entityType: "user", entityId: u.id });
    return bad;
  }
  await grantAdminMfa(u.id);
  return ok({ verified: true });
}

export async function lockAdminMfaAction() {
  await operator();
  await clearAdminMfa();
  return ok({ locked: true });
}
