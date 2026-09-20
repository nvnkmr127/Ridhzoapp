"use server";

import { requireAuth } from "@/lib/rbac";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { EMAIL_NOTIFICATION_TYPES } from "@/lib/notifications/emailTypes";
import { ok, actionFail } from "@/lib/actions/result";

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
