import crypto from "crypto";

// Google OAuth + Calendar over fetch (no SDK). Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// and GOOGLE_REDIRECT_URI (e.g. https://app.example.com/api/integrations/google/callback).

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/integrations/google/callback` : undefined);
const STATE_SECRET = process.env.NEXTAUTH_SECRET || "dev-google-state-secret";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

// CSRF state bound to the connecting user, so the callback can't be replayed for someone else.
export function makeState(userId: string) {
  const sig = crypto.createHmac("sha256", STATE_SECRET).update(userId).digest("hex").slice(0, 32);
  return `${userId}.${sig}`;
}
export function verifyState(state: string): string | null {
  const [userId, sig] = state.split(".");
  if (!userId || !sig) return null;
  return makeState(userId) === state ? userId : null;
}

export function getAuthUrl(userId: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: REDIRECT_URI!,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: makeState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResp = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCode(code: string): Promise<TokenResp> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, redirect_uri: REDIRECT_URI!, grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResp> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function insertEvent(accessToken: string, calendarId: string, event: {
  summary: string; description?: string; start: Date; end: Date; attendeeEmail?: string;
}) {
  const body: any = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
  };
  if (event.attendeeEmail) body.attendees = [{ email: event.attendeeEmail }];

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar insert failed (${res.status}): ${await res.text()}`);
  return res.json();
}
