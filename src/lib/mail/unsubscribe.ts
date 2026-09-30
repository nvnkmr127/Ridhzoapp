// One-click email opt-out. A link carries (email, category, HMAC) so it can't be forged or used to
// unsubscribe someone else; applying it appends `category` to users.email_opt_out, which every
// email sender already honours (notification types, "daily_summary", "billing_reminders", "newsletter").
import { createHmac, timingSafeEqual } from "crypto";

const LABELS: Record<string, string> = {
  new_lead: "new-lead alerts",
  lead_assigned: "lead-assigned alerts",
  follow_up_due: "follow-up due alerts",
  follow_up_overdue: "overdue follow-up alerts",
  sla_escalation: "lead escalation alerts",
  meeting_scheduled: "meeting-scheduled alerts",
  meeting_reminder: "meeting reminders",
  daily_summary: "the daily summary email",
  billing_reminders: "renewal reminders and usage alerts",
  newsletter: "the Ridhzo newsletter",
};
export const unsubscribeLabel = (category: string) => LABELS[category] ?? "emails like this";

const secret = () => process.env.NEXTAUTH_SECRET || process.env.EMAIL_SECRET_KEY || "";
export const unsubscribeToken = (email: string, category: string) =>
  createHmac("sha256", secret()).update(`${email.trim().toLowerCase()}|${category}`).digest("base64url");

export function verifyUnsubscribe(email: string, category: string, token: string) {
  if (!secret() || !email || !category || !token) return false;
  const a = Buffer.from(unsubscribeToken(email, category));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function applyUnsubscribe(email: string, category: string) {
  // Lazy: the mailer imports this file for tokens only and shouldn't pull the DB into its graph.
  const [{ db }, { users }, { and, eq, sql }] = await Promise.all([import("@/db"), import("@/db/schema"), import("drizzle-orm")]);
  const e = email.trim().toLowerCase();
  await db
    .update(users)
    .set({ emailOptOut: sql`${users.emailOptOut} || ${JSON.stringify([category])}::jsonb` })
    .where(and(eq(users.email, e), sql`NOT (${users.emailOptOut} @> ${JSON.stringify([category])}::jsonb)`));
  if (category === "newsletter" && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      await new Resend(process.env.RESEND_API_KEY).contacts.update({ email: e, unsubscribed: true });
    } catch (err) {
      console.warn("[unsubscribe] resend contact update failed", err);
    }
  }
}
