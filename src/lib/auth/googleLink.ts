import crypto from "crypto";

// "Connect Google" from Profile: before the OAuth redirect we set a short-lived signed cookie naming the
// logged-in user, and the Google signIn callback attaches the (Google-verified) email to that user
// instead of creating a new workspace.
export const GOOGLE_LINK_COOKIE = "ridhzo_link_google";
export const GOOGLE_LINK_TTL_SEC = 10 * 60;

function sign(value: string) {
  return crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET || "").update(value).digest("hex");
}

export function makeGoogleLinkToken(userId: string, now = Date.now()) {
  const value = `${userId}.${now + GOOGLE_LINK_TTL_SEC * 1000}`;
  return `${value}.${sign(value)}`;
}

// Returns the user id if the token is authentic and unexpired, else null.
export function readGoogleLinkToken(raw: string | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  const [userId, expires, sig] = raw.split(".");
  if (!userId || !expires || !sig) return null;
  const expected = Buffer.from(sign(`${userId}.${expires}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (Number(expires) < now) return null;
  return userId;
}

// Phone signups get a placeholder address; treat it as "no email" everywhere users see it.
export const PHONE_EMAIL_DOMAIN = "@phone.ridhzo.com";
export const isPlaceholderEmail = (email: string | null | undefined) => !!email?.endsWith(PHONE_EMAIL_DOMAIN);
