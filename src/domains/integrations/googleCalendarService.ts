import { db } from "@/db";
import { googleCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as google from "@/lib/integrations/google";
import { encryptSecret, readSecret } from "@/lib/crypto/secret";

// OAuth access/refresh tokens are encrypted at rest (AES-256-GCM). Reads go through readSecret,
// which transparently returns legacy plaintext rows so this migrates without a backfill.
export class GoogleCalendarService {
  static async isConnected(userId: string) {
    const [row] = await db.select({ userId: googleCredentials.userId }).from(googleCredentials).where(eq(googleCredentials.userId, userId)).limit(1);
    return Boolean(row);
  }

  // Persist tokens from the OAuth callback. Keeps the existing refresh token if Google omits one.
  static async connect(userId: string, tokens: { access_token: string; refresh_token?: string; expires_in: number }) {
    const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
    const [existing] = await db.select({ refreshToken: googleCredentials.refreshToken }).from(googleCredentials).where(eq(googleCredentials.userId, userId)).limit(1);
    const accessToken = encryptSecret(tokens.access_token);
    // A new refresh token is encrypted; when Google omits one, keep the stored value as-is (already
    // encrypted, or legacy plaintext that readSecret still handles).
    const refreshToken = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : (existing?.refreshToken ?? null);

    if (existing) {
      await db.update(googleCredentials)
        .set({ accessToken, refreshToken, expiryDate, updatedAt: new Date() })
        .where(eq(googleCredentials.userId, userId));
    } else {
      await db.insert(googleCredentials).values({ userId, accessToken, refreshToken, expiryDate });
    }
  }

  static async disconnect(userId: string) {
    await db.delete(googleCredentials).where(eq(googleCredentials.userId, userId));
  }

  // Returns a valid access token, refreshing it if expired (or about to). Null if not connected.
  private static async validToken(userId: string) {
    const [cred] = await db.select().from(googleCredentials).where(eq(googleCredentials.userId, userId)).limit(1);
    if (!cred) return null;

    const accessToken = readSecret(cred.accessToken);
    const refreshToken = readSecret(cred.refreshToken);
    if (!accessToken) return null;

    const stillValid = cred.expiryDate && cred.expiryDate.getTime() - Date.now() > 60_000;
    if (stillValid) return { accessToken, calendarId: cred.calendarId };

    if (!refreshToken) return { accessToken, calendarId: cred.calendarId };
    const refreshed = await google.refreshAccessToken(refreshToken);
    await db.update(googleCredentials)
      .set({ accessToken: encryptSecret(refreshed.access_token), expiryDate: new Date(Date.now() + refreshed.expires_in * 1000), updatedAt: new Date() })
      .where(eq(googleCredentials.userId, userId));
    return { accessToken: refreshed.access_token, calendarId: cred.calendarId };
  }

  // Best-effort: create a calendar event for the user. Returns the event (id + Meet link when
  // requested), or null if not connected/unconfigured/failed.
  static async createEvent(userId: string, event: google.CalendarEventInput) {
    if (!google.isConfigured()) return null;
    try {
      const token = await this.validToken(userId);
      if (!token) return null;
      const created = await google.insertEvent(token.accessToken, token.calendarId, event);
      return { id: created.id, meetUrl: created.hangoutLink ?? null };
    } catch (e) {
      console.error("[google-calendar] event create failed", e);
      return null;
    }
  }

  static async updateEvent(userId: string, eventId: string, event: google.CalendarEventInput) {
    if (!google.isConfigured()) return false;
    try {
      const token = await this.validToken(userId);
      if (!token) return false;
      await google.patchEvent(token.accessToken, token.calendarId, eventId, event);
      return true;
    } catch (e) {
      console.error("[google-calendar] event update failed", e);
      return false;
    }
  }

  static async deleteEvent(userId: string, eventId: string) {
    if (!google.isConfigured()) return false;
    try {
      const token = await this.validToken(userId);
      if (!token) return false;
      await google.deleteEvent(token.accessToken, token.calendarId, eventId);
      return true;
    } catch (e) {
      console.error("[google-calendar] event delete failed", e);
      return false;
    }
  }
}
