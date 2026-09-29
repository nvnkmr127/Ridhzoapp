import { db } from "@/db";
import { leads } from "@/db/schema";
import crypto from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { activities } from "@/db/schema";
import { ActivityService } from "@/domains/activities/service";

// Inbound email → lead timeline. Mirrors the WhatsApp inbound path: match the sender to a known
// lead by email, log it as a `message`/`email` activity so replies show up next to the outbound
// emails already logged by sendEmailAction. No dedicated table until a threaded-email UI exists —
// the activity timeline IS the thread. ponytail: activity log, add email_messages table if/when
// a threaded reader is built.

/** Pull the bare address out of a From header like `Ada Lovelace <ada@example.com>`. */
export function extractEmail(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

/** Timeline entry text for an inbound email. Truncates the body so one message can't bloat a row. */
export function formatInbound(subject: string, body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ").slice(0, 2000);
  return `[email ← lead] ${subject || "(no subject)"}${trimmed ? `: ${trimmed}` : ""}`;
}

const AUTO_SUBJECT = /^\s*(auto(matic)?[ -]?(reply|response)|out of office|undeliverable|delivery (status|failure)|mail delivery failed|returned mail|failure notice)/i;
const AUTO_SENDER = /^(mailer-daemon|postmaster|no-?reply|donotreply|do-not-reply)@/i;

/** Bounces, out-of-office and other machine mail — not a lead replying, so it must not stop a drip. */
export function isAutoReply(input: { from: string; subject: string; autoSubmitted?: string }): boolean {
  if (input.autoSubmitted && input.autoSubmitted.toLowerCase() !== "no") return true;
  const email = extractEmail(input.from) ?? "";
  return AUTO_SENDER.test(email) || AUTO_SUBJECT.test(input.subject);
}

/** Crude HTML → text for providers that send only an HTML part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

export class EmailInboundService {
  /** Record an inbound email against the matching lead. Returns whether it landed on a known lead. */
  static async recordInbound(input: {
    from: string;
    subject: string;
    body: string;
    organizationId?: string;
    messageId?: string;
  }): Promise<{ matched: boolean; leadId?: string; duplicate?: boolean }> {
    const email = extractEmail(input.from);
    if (!email) return { matched: false };

    const conditions = [sql`lower(${leads.email}) = ${email}`, isNull(leads.deletedAt)]; // not the recycle bin
    if (input.organizationId) conditions.push(eq(leads.organizationId, input.organizationId));

    // Several leads can share an address; land on the most recently active one, deterministically.
    const [lead] = await db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.updatedAt)).limit(1);
    if (!lead) return { matched: false };

    // Providers retry on timeouts: the same message must land on the timeline once. Message-ID when
    // the provider sends it, else a hash of the content.
    const externalRef = `in:${crypto.createHash("sha1").update(input.messageId || `${email}\n${input.subject}\n${input.body}`).digest("hex")}`;
    const [seen] = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.leadId, lead.id), eq(activities.externalRef, externalRef))).limit(1);
    if (seen) return { matched: true, leadId: lead.id, duplicate: true };

    await ActivityService.addActivity({
      leadId: lead.id,
      type: "email",
      content: formatInbound(input.subject, input.body),
      externalRef,
    });
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, lead.id)); // a reply is fresh activity
    // A reply means the lead is engaged — stop any running drip so we don't keep auto-messaging.
    const { SequenceService } = await import("./sequenceService");
    await SequenceService.stopForLead(lead.id, "lead replied by email").catch((e) =>
      console.error("[inbound-email] couldn't stop the sequence after a reply — the lead may keep getting drip messages", lead.id, e),
    );
    return { matched: true, leadId: lead.id };
  }
}
