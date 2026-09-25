import { db } from "@/db";
import { deviceTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

// Expo push: mobile counterpart to the web-push PushService. Best-effort — never throws into callers.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string; // Android channel (see lib/push/channels)
  badge?: number; // app-icon badge = unread count
}

export const ExpoPushService = {
  // Upsert a device token (token is unique; re-registering the same device just refreshes it).
  async register(userId: string, organizationId: string, token: string, platform?: string) {
    await db
      .insert(deviceTokens)
      .values({ userId, organizationId, token, platform })
      .onConflictDoUpdate({
        target: deviceTokens.token,
        set: { userId, organizationId, platform, updatedAt: new Date() },
      });
  },

  async remove(token: string) {
    await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
  },

  // Send to Expo push tokens (ExponentPushToken[...]). Returns the tokens that are dead and
  // should be dropped. The unified dispatcher (mobile.ts) owns the DB lookup + routing.
  async sendToTokens(tokens: string[], message: ExpoPushMessage): Promise<string[]> {
    if (tokens.length === 0) return [];
    try {
      const messages = tokens.map((to) => ({
        to,
        title: message.title,
        body: message.body ?? "",
        data: message.data ?? {},
        sound: "default",
        priority: "high", // heads-up on Android, immediate delivery
        ...(message.channelId ? { channelId: message.channelId } : {}),
        ...(message.badge !== undefined ? { badge: message.badge } : {}),
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });

      // Expo returns per-message receipts; a DeviceNotRegistered error means drop the token.
      const json: any = await res.json().catch(() => null);
      const receipts: any[] = json?.data ?? [];
      const dead: string[] = [];
      receipts.forEach((rcpt, i) => {
        if (rcpt?.details?.error === "DeviceNotRegistered") dead.push(messages[i].to);
      });
      return dead;
    } catch (e) {
      console.error("[expo-push] send failed", e);
      return [];
    }
  },
};
