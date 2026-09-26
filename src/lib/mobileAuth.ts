import crypto from "crypto";

// Self-contained HS256 JWT for the mobile app — signed with NEXTAUTH_SECRET, no extra deps.
// NextAuth's own tokens are encrypted JWE (cookie-bound); native clients need a plain bearer token,
// so we mint/verify our own here. Used by the /api/v1/auth routes (mint) and the /api/v1 routes (verify).
const SECRET = process.env.NEXTAUTH_SECRET || "";
// Google sign-in codes use a derived key, so a code can never be replayed as a bearer token.
const CODE_SECRET = SECRET && `${SECRET}:mobile-google-code`;

export interface MobileTokenPayload {
  sub: string;            // userId
  org: string;            // organizationId
  role: string | null;   // roleId
  email: string;
  jti?: string;           // per-token id, so one phone's sign-out can revoke just its token
  iat?: number;
  exp?: number;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: object, key: string, expiresInSec: number) {
  if (!key) throw new Error("NEXTAUTH_SECRET is not set");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }));
  const sig = crypto.createHmac("sha256", key).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verify<T extends { exp?: number }>(token: string, key: string): T | null {
  if (!token || !key) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;

  const expected = crypto.createHmac("sha256", key).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signMobileToken(payload: Omit<MobileTokenPayload, "iat" | "exp" | "jti">, expiresInSec = 60 * 60 * 24 * 30) {
  return sign({ ...payload, jti: crypto.randomUUID() }, SECRET, expiresInSec);
}

export function verifyMobileToken(token: string): MobileTokenPayload | null {
  return verify<MobileTokenPayload>(token, SECRET);
}

// ---- Google sign-in hand-off (PKCE-style) ----
// The app opens the browser with challenge = base64url(sha256(verifier)); after Google sign-in the server
// redirects back to ridhzo://auth?code=… and the app exchanges code + verifier for a token. Another app
// that intercepts the redirect gets a 2-minute code it can't use without the verifier.
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function signGoogleCode(userId: string, challenge: string) {
  return sign({ sub: userId, ch: challenge }, CODE_SECRET, 120);
}

export function verifyGoogleCode(code: string, verifier: string): string | null {
  const p = verify<{ sub: string; ch: string; exp?: number }>(code, CODE_SECRET);
  if (!p) return null;
  const ch = crypto.createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(ch);
  const b = Buffer.from(p.ch);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? p.sub : null;
}

// The {token, user} body every mobile sign-in route returns.
export function mobileSession(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  roleId: string | null;
  organizationId: string;
}) {
  return {
    token: signMobileToken({ sub: user.id, org: user.organizationId, role: user.roleId, email: user.email }),
    user: {
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.phone || user.email,
      phone: user.phone ?? null,
      organizationId: user.organizationId,
    },
  };
}

// ---- Attachment download links ----
// The app opens files in the system browser, which can't send the bearer token — so it gets a
// 10-minute link signed for one attachment and one user.
const FILE_SECRET = SECRET && `${SECRET}:mobile-attachment`;

export function signAttachmentLink(attachmentId: string, userId: string, ttlSec = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac("sha256", FILE_SECRET).update(`${attachmentId}.${userId}.${exp}`).digest("base64url");
  return `u=${encodeURIComponent(userId)}&exp=${exp}&sig=${sig}`;
}

export function verifyAttachmentLink(attachmentId: string, userId: string, exp: string, sig: string) {
  if (!FILE_SECRET || !/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac("sha256", FILE_SECRET).update(`${attachmentId}.${userId}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
