"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { EMAIL_NOTIFICATION_TYPES } from "@/lib/notifications/emailTypes";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function getEmailOptOutAction() {
  const session = await requireAuth();
  const [u] = await db.select({ emailOptOut: users.emailOptOut }).from(users).where(eq(users.id, session.user.id)).limit(1);
  return u?.emailOptOut ?? [];
}

export async function setEmailOptOutAction(optOut: string[]) {
  const session = await requireAuth();
  const allowed = new Set(EMAIL_NOTIFICATION_TYPES.map((t) => t.type));
  const clean = (Array.isArray(optOut) ? optOut : []).filter((t) => allowed.has(t));
  try {
    await db.update(users).set({ emailOptOut: clean, updatedAt: new Date() }).where(eq(users.id, session.user.id));
    revalidatePath("/profile");
    return ok(clean);
  } catch (e) {
    return actionFail(e);
  }
}

// App language for this person's menu and phone notifications (see lib/i18n).
export async function setLanguageAction(language: string) {
  const session = await requireAuth();
  const { isLang } = await import("@/lib/i18n");
  if (!isLang(language)) return fail("VALIDATION", "Unsupported language.");
  try {
    await db.update(users).set({ language, updatedAt: new Date() }).where(eq(users.id, session.user.id));
    revalidatePath("/", "layout");
    return ok(language);
  } catch (e) {
    return actionFail(e);
  }
}
