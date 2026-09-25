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

export const FcmPushService = {
  isConfigured(): boolean {
    return serviceAccount() !== null;
  },

  // Send to many FCM tokens. Returns the tokens that are dead (unregistered) and should be dropped.
  async sendToTokens(tokens: string[], message: FcmMessage): Promise<string[]> {
    const sa = serviceAccount();
    if (!sa || tokens.length === 0) return [];

    const token = await accessToken(sa);
    if (!token) return [];

    // FCM data values must be strings.
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(message.data ?? {})) data[k] = v == null ? "" : String(v);

    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const dead: string[] = [];

    await Promise.all(
      tokens.map(async (t) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                token: t,
                notification: { title: message.title, body: message.body ?? "" },
                data,
                android: {
                  priority: "high",
                  notification: {
                    sound: "default",
                    ...(message.channelId ? { channel_id: message.channelId } : {}),
                    ...(message.badge !== undefined ? { notification_count: message.badge } : {}),
                  },
                },
              },
            }),
          });
          if (!res.ok) {
            const err: any = await res.json().catch(() => null);
            const status = err?.error?.details?.[0]?.errorCode || err?.error?.status;
            // The token no longer maps to an install — drop it.
            if (res.status === 404 || status === "UNREGISTERED" || status === "INVALID_ARGUMENT") dead.push(t);
            else console.error("[fcm] send failed", res.status, err?.error?.message);
          }
        } catch (e) {
          console.error("[fcm] send error", e);
        }
      }),
    );
    return dead;
  },
};
