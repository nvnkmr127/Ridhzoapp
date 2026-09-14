import { db } from "@/db";
import { leadDistributionRules, leads } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type LeadForDistribution = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  sourceId: string | null;
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

export type DistributionRuleInput = {
  sourceId: string | null;
  recipients: string[];
  skipSave: boolean;
};

export class LeadDistributionService {
  static list(organizationId: string) {
    return db
      .select()
      .from(leadDistributionRules)
      .where(eq(leadDistributionRules.organizationId, organizationId));
  }

  static async create(organizationId: string, input: DistributionRuleInput) {
    const [row] = await db
      .insert(leadDistributionRules)
      .values({
        organizationId,
        sourceId: input.sourceId,
        recipients: input.recipients,
        skipSave: input.skipSave ? 1 : 0,
      })
      .returning();
    return row;
  }

  static async setActive(organizationId: string, id: string, isActive: boolean) {
    const [row] = await db
      .update(leadDistributionRules)
      .set({ isActive: isActive ? 1 : 0 })
      .where(and(eq(leadDistributionRules.id, id), eq(leadDistributionRules.organizationId, organizationId)))
      .returning();
    return row;
  }

  static async remove(organizationId: string, id: string) {
    await db
      .delete(leadDistributionRules)
      .where(and(eq(leadDistributionRules.id, id), eq(leadDistributionRules.organizationId, organizationId)));
  }

  // Evaluate every active rule against a freshly-created lead. Matching rules (source matches, or
  // rule has no source filter) get their recipients emailed. Best-effort and per-recipient isolated.
  static async distribute(leadId: string) {
    const { LeadService } = await import("@/domains/leads/service");
    const lead = (await LeadService.getLeadById(leadId)) as LeadForDistribution | null;
    if (!lead?.organizationId) return;

    const rules = await db
      .select()
      .from(leadDistributionRules)
      .where(
        and(
          eq(leadDistributionRules.organizationId, lead.organizationId),
          eq(leadDistributionRules.isActive, 1),
        ),
      );

    const matching = rules.filter((r) => r.sourceId === null || r.sourceId === lead.sourceId);
    if (matching.length === 0) return;

    // Union of recipient emails across all matching rules — each address is emailed at most once.
    const emails = [...new Set(matching.flatMap((r) => r.recipients ?? []))];
    if (emails.length > 0) {
      const { sendEmail, appUrl } = await import("@/lib/mail/mailer");
      const html = leadEmail(lead, appUrl(`/leads/${lead.id}`));
      const subject = `New lead: ${lead.name || lead.email || lead.phone || "Unnamed"}`;
      await Promise.all(
        emails.map(async (to) => {
          try {
            await sendEmail({ to, subject, html }, lead.organizationId);
          } catch (e) {
            console.error(`[distribution] email to ${to} failed`, (e as Error)?.message);
          }
        }),
      );
    }

    // "Don't save into my account": forward-only. We soft-delete after distributing.
    // ponytail: lead is created then soft-deleted, so lead.created side-effects (webhook, CAPI,
    // enrichment) still fire once. A true pre-persist skip would need a gate in the ingest path.
    if (matching.some((r) => r.skipSave)) {
      await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, lead.id));
    }
  }
}
