import { db } from "@/db";
import { deviceTokens, users } from "@/db/schema";
import { eq, inArray, lt, sql } from "drizzle-orm";
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
  // Idempotent: UNIQUE(token) makes it one row per device install. updated_at doubles as "last seen"
  // (see pruneStale): a re-register only writes when the device changed hands or wasn't seen for a
  // day, so an app that registers on every launch costs a read, not a write.
  async register(userId: string, organizationId: string, token: string, platform?: string) {
    await db
      .insert(deviceTokens)
      .values({ userId, organizationId, token, platform })
      .onConflictDoUpdate({
        target: deviceTokens.token,
        set: { userId, organizationId, platform, updatedAt: new Date() },
        setWhere: sql`${deviceTokens.userId} <> excluded.user_id
          OR ${deviceTokens.organizationId} <> excluded.organization_id
          OR ${deviceTokens.platform} IS DISTINCT FROM excluded.platform
          OR ${deviceTokens.updatedAt} < now() - interval '1 day'`,
      });
  },

  // Tokens not re-registered for 60 days belong to uninstalled / reinstalled apps (every launch
  // re-registers, refreshing updated_at at most daily). A pruned device that comes back re-registers.
  async pruneStale(days = 60) {
    const rows = await db
      .delete(deviceTokens)
      .where(lt(deviceTokens.updatedAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000)))
      .returning({ id: deviceTokens.id });
    return rows.length;
  },

  async remove(token: string) {
    await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
  },

  async sendToUser(userId: string, message: MobilePushMessage) {
    // A channel the user muted in the app's notification settings is not pushed (the in-app inbox still has it).
    if (message.channelId) {
      try {
        const [u] = await db.select({ off: users.pushOptOut }).from(users).where(eq(users.id, userId)).limit(1);
        if (u?.off?.includes(message.channelId)) return;
      } catch (e) {
        console.warn("[mobile-push] failed to check pushOptOut", e);
      }
    }
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
