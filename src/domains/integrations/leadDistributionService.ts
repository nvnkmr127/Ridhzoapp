import { db } from "@/db";
import { leadDistributionRules, leads } from "@/db/schema";
import type { DistributionRecipient, DistributionCondition } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { evaluateAllConditions } from "@/lib/leads/conditions";

type LeadForDistribution = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  sourceId: string | null;
  organizationId: string;
  customData: Record<string, unknown> | null;
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
  conditions: DistributionCondition[];
  recipients: DistributionRecipient[];
  mode: "all" | "round_robin";
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
        conditions: input.conditions,
        recipients: input.recipients,
        mode: input.mode,
        skipSave: input.skipSave ? 1 : 0,
      })
      .returning();
    return row;
  }

  static async update(organizationId: string, id: string, input: DistributionRuleInput) {
    const [row] = await db
      .update(leadDistributionRules)
      .set({
        sourceId: input.sourceId,
        conditions: input.conditions,
        recipients: input.recipients,
        mode: input.mode,
        skipSave: input.skipSave ? 1 : 0,
      })
      .where(and(eq(leadDistributionRules.id, id), eq(leadDistributionRules.organizationId, organizationId)))
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

  // Pick which recipients of a matching rule receive this lead. 'all' → everyone; 'round_robin' →
  // the next single recipient in rotation, advancing the cursor.
  // ponytail: cursor bump is a plain UPDATE, not locked. Two simultaneous leads could hit the same
  // recipient; fine at CRM lead volumes. Add SELECT … FOR UPDATE if that ever matters.
  private static async selectRecipients(rule: typeof leadDistributionRules.$inferSelect): Promise<DistributionRecipient[]> {
    const all = rule.recipients ?? [];
    if (all.length === 0) return [];
    if (rule.mode !== "round_robin") return all;
    const target = all[rule.rrCursor % all.length];
    await db
      .update(leadDistributionRules)
      .set({ rrCursor: (rule.rrCursor + 1) % all.length })
      .where(eq(leadDistributionRules.id, rule.id));
    return [target];
  }

  private static async dispatch(
    recipient: DistributionRecipient,
    lead: LeadForDistribution,
    ctx: { subject: string; html: string },
  ) {
    try {
      if (recipient.channel === "email") {
        const { sendEmail } = await import("@/lib/mail/mailer");
        await sendEmail({ to: recipient.value, subject: ctx.subject, html: ctx.html }, lead.organizationId);
      } else if (recipient.channel === "in_app") {
        const { NotificationService } = await import("@/domains/notifications/service");
        await NotificationService.create({
          userId: recipient.value,
          type: "new_lead",
          title: `New lead: ${lead.name ?? "Unknown"}`,
          body: lead.phone || lead.email || undefined,
          leadId: lead.id,
        });
      } else if (recipient.channel === "whatsapp") {
        const { isConfigured, WatxioClient } = await import("@/lib/messaging/whatsapp/client");
        const template = process.env.WATXIO_LEAD_FORWARD_TEMPLATE;
        // ponytail: cold recipients are outside the 24h window, so WhatsApp forwarding needs a
        // pre-approved template (WATXIO_LEAD_FORWARD_TEMPLATE) with body vars name, phone, source.
        if (!isConfigured() || !template) {
          console.warn("[distribution] whatsapp skipped: BSP or WATXIO_LEAD_FORWARD_TEMPLATE not configured");
          return;
        }
        await WatxioClient.sendTemplate(recipient.value, template, [
          lead.name ?? "Unnamed",
          lead.phone ?? "",
          lead.email ?? "",
        ]);
      }
    } catch (e) {
      console.error(`[distribution] ${recipient.channel} to ${recipient.value} failed`, (e as Error)?.message);
    }
  }

  // Evaluate every active rule against a freshly-created lead and forward matches. Best-effort.
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

    const matching = rules.filter(
      (r) => (r.sourceId === null || r.sourceId === lead.sourceId) && evaluateAllConditions(lead, r.conditions),
    );
    if (matching.length === 0) return;

    const { appUrl } = await import("@/lib/mail/mailer");
    const ctx = {
      subject: `New lead: ${lead.name || lead.email || lead.phone || "Unnamed"}`,
      html: leadEmail(lead, appUrl(`/leads/${lead.id}`)),
    };

    // Resolve recipients per rule (round-robin advances its own cursor), then dedupe identical
    // channel+value targets across rules so nobody is pinged twice for one lead.
    const targets: DistributionRecipient[] = [];
    const seen = new Set<string>();
    for (const rule of matching) {
      for (const r of await this.selectRecipients(rule)) {
        const key = `${r.channel}:${r.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          targets.push(r);
        }
      }
    }

    await Promise.all(targets.map((r) => this.dispatch(r, lead, ctx)));

    // "Don't save into my account": forward-only. We soft-delete after distributing.
    // ponytail: lead is created then soft-deleted, so lead.created side-effects (webhook, CAPI,
    // enrichment) still fire once. A true pre-persist skip would need a gate in the ingest path.
    if (matching.some((r) => r.skipSave)) {
      await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, lead.id));
    }
  }
}
