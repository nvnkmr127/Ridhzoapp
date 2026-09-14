import { db } from "@/db";
import { leadDistributionRecipients } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// The channels a new lead can be forwarded on. Only 'email' is wired today; in_app/whatsapp
// are reserved so adding them later is a switch-case extension, not a migration.
export const DISTRIBUTION_CHANNELS = ["email"] as const;
export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];

type LeadForDistribution = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  organizationId: string;
};

function leadEmail(lead: LeadForDistribution, link: string) {
  const row = (label: string, value: string | null) =>
    value ? `<tr><td style="padding:2px 12px 2px 0;color:#666">${label}</td><td style="padding:2px 0"><b>${value}</b></td></tr>` : "";
  return `
    <div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
      <h2 style="margin:0 0 12px">New lead: ${lead.name || "Unnamed"}</h2>
      <table style="border-collapse:collapse">
        ${row("Name", lead.name)}
        ${row("Email", lead.email)}
        ${row("Phone", lead.phone)}
        ${row("Company", lead.company)}
        ${row("Status", lead.status)}
      </table>
      <p style="margin:16px 0 0"><a href="${link}" style="color:#2563eb">Open lead in Ridhzo →</a></p>
    </div>`;
}

export class LeadDistributionService {
  static list(organizationId: string) {
    return db
      .select()
      .from(leadDistributionRecipients)
      .where(eq(leadDistributionRecipients.organizationId, organizationId));
  }

  static async create(organizationId: string, channel: DistributionChannel, destination: string) {
    const [row] = await db
      .insert(leadDistributionRecipients)
      .values({ organizationId, channel, destination })
      .returning();
    return row;
  }

  static async setActive(organizationId: string, id: string, isActive: boolean) {
    const [row] = await db
      .update(leadDistributionRecipients)
      .set({ isActive: isActive ? 1 : 0 })
      .where(and(eq(leadDistributionRecipients.id, id), eq(leadDistributionRecipients.organizationId, organizationId)))
      .returning();
    return row;
  }

  static async remove(organizationId: string, id: string) {
    await db
      .delete(leadDistributionRecipients)
      .where(and(eq(leadDistributionRecipients.id, id), eq(leadDistributionRecipients.organizationId, organizationId)));
  }

  // Fan a freshly-created lead out to every active recipient. Best-effort and per-recipient
  // isolated — one bad address must not stop the others or the caller (the lead.created handler).
  static async distribute(leadId: string) {
    const { LeadService } = await import("@/domains/leads/service");
    const lead = (await LeadService.getLeadById(leadId)) as LeadForDistribution | null;
    if (!lead?.organizationId) return;

    const recipients = await db
      .select()
      .from(leadDistributionRecipients)
      .where(
        and(
          eq(leadDistributionRecipients.organizationId, lead.organizationId),
          eq(leadDistributionRecipients.isActive, 1),
        ),
      );
    if (recipients.length === 0) return;

    const { sendEmail, appUrl } = await import("@/lib/mail/mailer");
    const html = leadEmail(lead, appUrl(`/leads/${lead.id}`));
    const subject = `New lead: ${lead.name || lead.email || lead.phone || "Unnamed"}`;

    await Promise.all(
      recipients.map(async (r) => {
        try {
          if (r.channel === "email") {
            await sendEmail({ to: r.destination, subject, html }, lead.organizationId);
          }
        } catch (e) {
          console.error(`[distribution] ${r.channel} to ${r.destination} failed`, (e as Error)?.message);
        }
      }),
    );
  }
}
