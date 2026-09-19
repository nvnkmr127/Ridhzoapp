import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

let configured = false;
let autoVapidKeys: { publicKey: string; privateKey: string } | null = null;

function getVapidKeys(): { publicKey: string; privateKey: string } {
  const rawPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const rawPriv = process.env.VAPID_PRIVATE_KEY;
  const pub = rawPub?.replace(/^["']|["']$/g, "").trim();
  const priv = rawPriv?.replace(/^["']|["']$/g, "").trim();
  if (pub && priv) {
    return { publicKey: pub, privateKey: priv };
  }
  if (!autoVapidKeys) {
    autoVapidKeys = webpush.generateVAPIDKeys();
  }
  return autoVapidKeys;
}

// Configure VAPID lazily so the app still boots when push isn't set up.
function ensureConfigured(): boolean {
  if (configured) return true;
  const keys = getVapidKeys();
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@ridhzo.com";
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

export const PushService = {
  getVapidKeys,
  async saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    // endpoint is unique; upsert so re-subscribing on the same device doesn't duplicate.
    await db.insert(pushSubscriptions)
      .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      });
  },

  async removeSubscription(endpoint: string, userId?: string) {
    const scope = userId
      ? and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId))
      : eq(pushSubscriptions.endpoint, endpoint);
    await db.delete(pushSubscriptions).where(scope);
  },

  // Fire a push to every device the user has enabled. Never throws — push is best-effort.
  async sendToUser(userId: string, payload: PushPayload) {
    if (!ensureConfigured()) return;
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    const body = JSON.stringify(payload);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: any) {
        // 404/410 => the subscription is dead; drop it so we stop trying.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
        }
      }
    }));
  },
};
