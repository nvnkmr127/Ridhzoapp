import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
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

export class EmailInboundService {
  /** Record an inbound email against the matching lead. Returns whether it landed on a known lead. */
  static async recordInbound(input: {
    from: string;
    subject: string;
    body: string;
    organizationId?: string;
  }): Promise<{ matched: boolean; leadId?: string }> {
    const email = extractEmail(input.from);
    if (!email) return { matched: false };

    const conditions = [sql`lower(${leads.email}) = ${email}`];
    if (input.organizationId) conditions.push(eq(leads.organizationId, input.organizationId));

    const [lead] = await db.select().from(leads).where(and(...conditions)).limit(1);
    if (!lead) return { matched: false };

    await ActivityService.addActivity({
      leadId: lead.id,
      type: "email",
      content: formatInbound(input.subject, input.body),
    });
    // A reply means the lead is engaged — stop any running drip so we don't keep auto-messaging.
    const { SequenceService } = await import("./sequenceService");
    await SequenceService.stopForLead(lead.id, "lead replied by email").catch(() => {});
    return { matched: true, leadId: lead.id };
  }
}
