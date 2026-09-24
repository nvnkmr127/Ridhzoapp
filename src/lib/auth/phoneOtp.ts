import crypto from "crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { phoneOtps } from "@/db/schema";

export const MAX_OTP_ATTEMPTS = 5;

// Checks the latest unused, unexpired OTP for this phone and consumes it on success. Wrong guesses
// count against the code; after MAX_OTP_ATTEMPTS it's locked and the user must request a new one.
export async function verifyPhoneOtp(phone: string, otp: string): Promise<"ok" | "invalid" | "locked"> {
  const otpHash = crypto.createHash("sha256").update(otp.trim()).digest("hex");
  const [record] = await db
    .select()
    .from(phoneOtps)
    .where(and(eq(phoneOtps.phone, phone), isNull(phoneOtps.usedAt), gt(phoneOtps.expiresAt, new Date())))
    .orderBy(desc(phoneOtps.createdAt))
    .limit(1);

  if (!record) return "invalid";
  if (record.attempts >= MAX_OTP_ATTEMPTS) return "locked";
  if (record.otpHash === otpHash) {
    await db.update(phoneOtps).set({ usedAt: new Date() }).where(eq(phoneOtps.id, record.id));
    return "ok";
  }
  await db.update(phoneOtps).set({ attempts: record.attempts + 1 }).where(eq(phoneOtps.id, record.id));
  return "invalid";
}
