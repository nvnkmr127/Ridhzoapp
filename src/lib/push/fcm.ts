import crypto from "crypto";

// Firebase Cloud Messaging (HTTP v1) sender. Uses a Google service account to mint an OAuth
// access token (signed JWT → token endpoint) and POSTs to the FCM v1 send API. No firebase-admin
// dependency — just node crypto + fetch. Best-effort: never throws into callers.
//
// Configure with either FIREBASE_SERVICE_ACCOUNT (the full JSON as a string) or the three parts:
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j.project_id && j.client_email && j.private_key) return j;
    } catch {
      /* fall through to the split-var form */
    }
  }
  const project_id = process.env.FIREBASE_PROJECT_ID;
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  // Private keys in env commonly have literal "\n" — normalize to real newlines.
  const private_key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (project_id && client_email && private_key) return { project_id, client_email, private_key };
  return null;
}

export interface FcmMessage {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  badge?: number;
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

let cachedToken: { value: string; exp: number } | null = null;

// Mint (and cache) an OAuth access token for the FCM scope from the service account.
async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    console.error("[fcm] token exchange failed", json?.error || res.status);
    return null;
  }
  cachedToken = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export interface FcmResult {
  dead: string[]; // tokens FCM says no longer map to an install — drop them
  accepted: number; // accepted by FCM (not proof the phone displayed it)
  failed: number;
}

// FCM v1 errors carry the reason in details[].errorCode (UNREGISTERED…) or, for a bad token, as an
// INVALID_ARGUMENT whose fieldViolations point at message.token. An INVALID_ARGUMENT about the
// payload says nothing about the token and must not delete it.
function tokenIsDead(httpStatus: number, err: any): boolean {
  const e = err?.error;
  const codes = [e?.status, ...(e?.details ?? []).map((d: any) => d?.errorCode)];
  if (httpStatus === 404 || codes.includes("UNREGISTERED")) return true;
  return codes.includes("INVALID_ARGUMENT") && JSON.stringify(e?.details ?? []).includes("message.token");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const FcmPushService = {
  isConfigured(): boolean {
    return serviceAccount() !== null;
  },

  // Send to many FCM tokens. Best-effort; every outcome is logged with the FCM message id so a
  // "push never arrived" report can be traced (accepted by FCM ≠ displayed on the device).
  async sendToTokens(tokens: string[], message: FcmMessage): Promise<FcmResult> {
    const result: FcmResult = { dead: [], accepted: 0, failed: 0 };
    if (tokens.length === 0) return result;
    const sa = serviceAccount();
    if (!sa) {
      console.warn("[fcm] cannot send pushes: Firebase service account is not configured");
      result.failed = tokens.length;
      return result;
    }

    // FCM data values must be strings.
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(message.data ?? {})) data[k] = v == null ? "" : String(v);

    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    // Time-sensitive channels (leads, reminders, meetings) go high priority so Doze doesn't hold them;
    // summaries/billing don't need to wake the phone.
    const priority = message.channelId === "updates" ? "normal" : "high";

    const post = async (t: string, bearer: string) =>
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t,
            notification: { title: message.title, body: message.body ?? "" },
            data,
            android: {
              priority,
              notification: {
                sound: "default",
                ...(message.channelId ? { channel_id: message.channelId } : {}),
                ...(message.badge !== undefined ? { notification_count: message.badge } : {}),
              },
            },
          },
        }),
      });

    await Promise.all(
      tokens.map(async (t) => {
        const started = Date.now();
        const tail = t.slice(-8);
        try {
          let bearer = await accessToken(sa);
          if (!bearer) return void result.failed++;
          let res = await post(t, bearer);
          // Expired/revoked OAuth token: mint a fresh one once. Quota / transient server errors: one
          // short retry (honouring Retry-After, capped) so a blip doesn't drop a lead alert.
          if (res.status === 401) {
            cachedToken = null;
            bearer = await accessToken(sa);
            if (bearer) res = await post(t, bearer);
          } else if (res.status === 429 || res.status >= 500) {
            await sleep(Math.min(Number(res.headers.get("retry-after")) * 1000 || 1000, 3000));
            res = await post(t, bearer);
          }
          const body: any = await res.json().catch(() => null);
          if (res.ok) {
            result.accepted++;
            console.info("[fcm] accepted", { token: tail, id: body?.name, channel: message.channelId, ms: Date.now() - started });
            return;
          }
          result.failed++;
          const dead = tokenIsDead(res.status, body);
          if (dead) result.dead.push(t);
          // SENDER_ID_MISMATCH = this token belongs to another Firebase project (debug/prod mix-up or
          // wrong service account) — loud, and never treated as a dead token.
          console.error("[fcm] rejected", { token: tail, http: res.status, status: body?.error?.status, dead, message: body?.error?.message });
        } catch (e) {
          result.failed++;
          console.error("[fcm] send error", { token: tail }, e);
        }
      }),
    );
    return result;
  },
};
