import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

// Step-up proof for platform operators: after a valid TOTP code the browser holds this signed,
// httpOnly cookie for MFA_TTL_SEC. requireSuperAdmin() refuses without it, so a stolen password or
// session alone can't run any platform action (hard-delete tenant, impersonate, export dossier…).
const COOKIE = "admin_mfa";
export const MFA_TTL_SEC = 2 * 60 * 60;

const key = () => `${process.env.NEXTAUTH_SECRET ?? ""}:admin-mfa`;
const sign = (userId: string, exp: number) => crypto.createHmac("sha256", key()).update(`${userId}.${exp}`).digest("base64url");

export function mfaToken(userId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MFA_TTL_SEC;
  return `${exp}.${sign(userId, exp)}`;
}

export function mfaTokenValid(userId: string, token: string | undefined, now = Date.now()): boolean {
  if (!token || !process.env.NEXTAUTH_SECRET) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Math.floor(now / 1000)) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(userId, exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function hasAdminMfa(userId: string): Promise<boolean> {
  if (process.env.ADMIN_MFA_REQUIRED === "0") return true; // explicit local/dev opt-out only
  return mfaTokenValid(userId, (await cookies()).get(COOKIE)?.value);
}

export async function grantAdminMfa(userId: string) {
  (await cookies()).set(COOKIE, mfaToken(userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MFA_TTL_SEC,
  });
}

export async function clearAdminMfa() {
  (await cookies()).delete(COOKIE);
}
