import { db } from "@/db";
import { deviceTokens } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ExpoPushService } from "./expo";
import { FcmPushService } from "./fcm";

// Unified mobile push. A device registers either an Expo push token ("ExponentPushToken[...]",
// used in Expo Go / when no FCM creds) or a raw FCM registration token (dev/prod builds with
// google-services.json). We route each token to the right transport by its format, so both work
// side by side. Best-effort — never throws into callers.

export interface MobilePushMessage {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  badge?: number;
}

const isExpoToken = (t: string) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken");

export const MobilePushService = {
  // Upsert a device token (token is unique; re-registering the same device refreshes it).
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

  async sendToUser(userId: string, message: MobilePushMessage) {
    const rows = await db.select({ token: deviceTokens.token }).from(deviceTokens).where(eq(deviceTokens.userId, userId));
    if (!Array.isArray(rows) || rows.length === 0) return;

    const expoTokens = rows.map((r) => r.token).filter(isExpoToken);
    const fcmTokens = rows.map((r) => r.token).filter((t) => !isExpoToken(t));

    const [deadExpo, deadFcm] = await Promise.all([
      ExpoPushService.sendToTokens(expoTokens, message),
      FcmPushService.sendToTokens(fcmTokens, message),
    ]);

    const dead = [...deadExpo, ...deadFcm];
    if (dead.length) await db.delete(deviceTokens).where(inArray(deviceTokens.token, dead));
  },
};
