import { db } from "@/db";
import { leadDistributionRules, leadDistributionDeliveries, leadSources } from "@/db/schema";
import type { DistributionRecipient, DistributionConditionGroup } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { evaluateConditionGroup } from "@/lib/leads/conditions";
import { escapeHtml } from "@/lib/utils";

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

type Rule = typeof leadDistributionRules.$inferSelect;

function leadEmail(lead: LeadForDistribution, link: string) {
  const row = (label: string, value: string | null) =>
    value ? `<tr><td style="padding:2px 12px 2px 0;color:#666">${label}</td><td style="padding:2px 0"><b>${escapeHtml(value)}</b></td></tr>` : "";
  return `
    <div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
      <h2 style="margin:0 0 12px">New lead: ${escapeHtml(lead.name || "Unnamed")}</h2>
      <table style="border-collapse:collapse">
        ${row("Name", lead.name)}
        ${row("Email", lead.email)}
        ${row("Phone", lead.phone)}
        ${row("Company", lead.company)}
        ${row("Status", lead.status)}
      </table>
      <p style="margin:16px 0 0"><a href="${escapeHtml(link)}" style="color:#2563eb">Open lead in Ridhzo →</a></p>
    </div>`;
}

// Accept both the current group shape and legacy flat arrays, so old rows still evaluate.
function asGroup(conditions: unknown): DistributionConditionGroup {
  if (Array.isArray(conditions)) return { type: "AND", conditions: conditions as any };
  return (conditions as DistributionConditionGroup) ?? { type: "AND", conditions: [] };
}

export type DistributionRuleInput = {
  name: string | null;
  sourceId: string | null;
  conditions: DistributionConditionGroup;
  recipients: DistributionRecipient[];
  mode: "all" | "round_robin";
};

export class LeadDistributionService {
  static list(organizationId: string) {
    return db
      .select()
      .from(leadDistributionRules)
      .where(eq(leadDistributionRules.organizationId, organizationId))
      .orderBy(desc(leadDistributionRules.createdAt));
  }

  // Real (non-test) sends per rule, per recipient ("channel:value") — the round-robin load display.
  static async deliveryCounts(organizationId: string): Promise<Record<string, Record<string, number>>> {
    const rows = await db
      .select({
        ruleId: leadDistributionDeliveries.ruleId,
        channel: leadDistributionDeliveries.channel,
        recipient: leadDistributionDeliveries.recipient,
        n: sql<number>`count(*)::int`,
      })
      .from(leadDistributionDeliveries)
      .where(and(
        eq(leadDistributionDeliveries.organizationId, organizationId),
        eq(leadDistributionDeliveries.status, "sent"),
        eq(leadDistributionDeliveries.isTest, 0),
      ))
      .groupBy(leadDistributionDeliveries.ruleId, leadDistributionDeliveries.channel, leadDistributionDeliveries.recipient);
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) (out[r.ruleId] ??= {})[`${r.channel}:${r.recipient}`] = r.n;
    return out;
  }

  static listDeliveries(organizationId: string, ruleId: string, limit = 20) {
    return db
      .select()
      .from(leadDistributionDeliveries)
      .where(and(eq(leadDistributionDeliveries.organizationId, organizationId), eq(leadDistributionDeliveries.ruleId, ruleId)))
      .orderBy(desc(leadDistributionDeliveries.createdAt))
      .limit(limit);
  }

  // A rule may only target one of the org's own sources.
  static async ownsSource(organizationId: string, sourceId: string) {
    const [row] = await db
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(and(eq(leadSources.id, sourceId), eq(leadSources.organizationId, organizationId)))
      .limit(1);
    return !!row;
  }

  static async create(organizationId: string, input: DistributionRuleInput) {
    const [row] = await db
      .insert(leadDistributionRules)
      .values({
        organizationId,
        name: input.name,
        sourceId: input.sourceId,
        conditions: input.conditions,
        recipients: input.recipients,
        mode: input.mode,
      })
      .returning();
    return row;
  }

  static async update(organizationId: string, id: string, input: DistributionRuleInput) {
    const [row] = await db
      .update(leadDistributionRules)
      .set({
        name: input.name,
        sourceId: input.sourceId,
        conditions: input.conditions,
        recipients: input.recipients,
        mode: input.mode,
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

  // Active team-member ids — used to drop deactivated/deleted in_app recipients from rotation.
  private static async activeUserIds(organizationId: string): Promise<Set<string>> {
    const { UserService } = await import("@/domains/users/service");
    const users = await UserService.list(organizationId);
    return new Set(users.filter((u) => u.isActive !== false).map((u) => u.id));
  }

  // Drop in_app recipients whose user is no longer active; other channels pass through.
  private static liveRecipients(rule: Rule, activeUsers: Set<string>): DistributionRecipient[] {
    return (rule.recipients ?? []).filter((r) => r.channel !== "in_app" || activeUsers.has(r.value));
  }

  // Choose recipients for this lead: 'all' → everyone live; 'round_robin' → the next live one.
  // The cursor bump is a single atomic increment, so concurrent leads never read the same slot.
  private static async selectRecipients(rule: Rule, live: DistributionRecipient[]): Promise<DistributionRecipient[]> {
    if (live.length === 0) return [];
    if (rule.mode !== "round_robin") return live;
    const [row] = await db
      .update(leadDistributionRules)
      .set({ rrCursor: sql`${leadDistributionRules.rrCursor} + 1` })
      .where(eq(leadDistributionRules.id, rule.id))
      .returning({ n: leadDistributionRules.rrCursor });
    const slot = (row?.n ?? rule.rrCursor + 1) - 1;
    return [live[slot % live.length]];
  }

  private static async dispatch(
    recipient: DistributionRecipient,
    lead: LeadForDistribution,
    ctx: { subject: string; html: string; isTest?: boolean },
  ): Promise<{ status: "sent" | "skipped" | "failed"; error?: string }> {
    try {
      if (recipient.channel === "email") {
        const { sendEmail } = await import("@/lib/mail/mailer");
        await sendEmail({ to: recipient.value, subject: ctx.subject, html: ctx.html }, lead.organizationId);
        return { status: "sent" };
      }
      if (recipient.channel === "in_app") {
        const { NotificationService } = await import("@/domains/notifications/service");
        await NotificationService.create({
          userId: recipient.value,
          type: "new_lead",
          title: "New lead: {name}",
          titleVars: { name: lead.name ?? "Unknown" },
          body: lead.phone || lead.email || undefined,
          // A test lead doesn't exist, and notifications.lead_id is a FK — omit it for tests.
          leadId: ctx.isTest ? undefined : lead.id,
        });
        return { status: "sent" };
      }
      if (recipient.channel === "whatsapp") {
        const { isConfigured, WatxioClient } = await import("@/lib/messaging/whatsapp/client");
        const template = process.env.WATXIO_LEAD_FORWARD_TEMPLATE;
        // ponytail: cold recipients need a pre-approved template (WATXIO_LEAD_FORWARD_TEMPLATE).
        if (!isConfigured() || !template) {
          return { status: "skipped", error: "WhatsApp not configured (BSP or WATXIO_LEAD_FORWARD_TEMPLATE)" };
        }
        await WatxioClient.sendTemplate(recipient.value, template, [lead.name ?? "Unnamed", lead.phone ?? "", lead.email ?? ""]);
        return { status: "sent" };
      }
      return { status: "skipped", error: `Unknown channel ${recipient.channel}` };
    } catch (e) {
      return { status: "failed", error: (e as Error)?.message?.slice(0, 500) };
    }
  }

  private static async logDeliveries(
    organizationId: string,
    ruleId: string,
    leadId: string | null,
    isTest: boolean,
    results: Array<{ recipient: DistributionRecipient; status: string; error?: string }>,
  ) {
    if (results.length === 0) return;
    await db.insert(leadDistributionDeliveries).values(
      results.map((r) => ({
        organizationId,
        ruleId,
        leadId,
        channel: r.recipient.channel,
        recipient: r.recipient.value,
        status: r.status,
        error: r.error,
        isTest: isTest ? 1 : 0,
      })),
    );
  }

  // Evaluate every active rule against a freshly-created lead and forward matches. Best-effort.
  static async distribute(leadId: string) {
    const { LeadService } = await import("@/domains/leads/service");
    const leadRow = (await LeadService.getLeadById(leadId)) as LeadForDistribution | null;
    if (!leadRow?.organizationId) return;

    // Attach tags so `tag` criteria can match (evaluator reads lead.tags as a comma string).
    const { TagService } = await import("@/domains/tags/service");
    const tags = await TagService.getForLead(leadId).catch(() => [] as { name: string }[]);
    const tagStr = tags.map((t) => t.name).join(", ");
    // Expose under both "tag" and "tags" so either field name in a criterion matches.
    const lead = { ...leadRow, tag: tagStr, tags: tagStr } as LeadForDistribution & { tag: string; tags: string };

    const rules = await db
      .select()
      .from(leadDistributionRules)
      .where(and(eq(leadDistributionRules.organizationId, lead.organizationId), eq(leadDistributionRules.isActive, 1)));

    const matching = rules.filter(
      (r) => (r.sourceId === null || r.sourceId === lead.sourceId) && evaluateConditionGroup(lead, asGroup(r.conditions)),
    );
    if (matching.length === 0) return;

    const activeUsers = await this.activeUserIds(lead.organizationId);
    const { appUrl } = await import("@/lib/mail/mailer");
    const ctx = {
      subject: `New lead: ${lead.name || lead.email || lead.phone || "Unnamed"}`,
      html: leadEmail(lead, appUrl(`/leads/${lead.id}`)),
    };

    // Each recipient gets a lead once, even if several rules match. Already-notified recipients are
    // removed before round-robin picks, so a rule's turn is never spent on a duplicate.
    const seen = new Set<string>();
    const key = (r: DistributionRecipient) => `${r.channel}:${r.value}`;
    for (const rule of matching) {
      const live = this.liveRecipients(rule, activeUsers).filter((r) => !seen.has(key(r)));
      const targets = await this.selectRecipients(rule, live);
      targets.forEach((r) => seen.add(key(r)));
      const results = await Promise.all(
        targets.map(async (r) => ({ recipient: r, ...(await this.dispatch(r, lead, ctx)) })),
      );
      await this.logDeliveries(lead.organizationId, rule.id, lead.id, false, results);
    }
  }

  // Fire a synthetic lead through one rule's recipients to verify the setup end to end.
  static async sendTest(organizationId: string, ruleId: string) {
    const [rule] = await db
      .select()
      .from(leadDistributionRules)
      .where(and(eq(leadDistributionRules.id, ruleId), eq(leadDistributionRules.organizationId, organizationId)));
    if (!rule) return { ok: false as const, message: "Rule not found." };

    const lead: LeadForDistribution = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Test Lead",
      email: "test@example.com",
      phone: "+15551234567",
      company: "Acme Corp",
      status: "new",
      sourceId: rule.sourceId,
      organizationId,
      customData: {},
    };
    const activeUsers = await this.activeUserIds(organizationId);
    const live = this.liveRecipients(rule, activeUsers);
    if (live.length === 0) return { ok: false as const, message: "This rule has no deliverable recipients." };

    const { appUrl } = await import("@/lib/mail/mailer");
    const ctx = {
      subject: `[TEST] New lead: ${lead.name}`,
      html: leadEmail(lead, appUrl(`/leads`)),
      isTest: true,
    };
    // A test always goes to every recipient (ignore round-robin), so you can confirm each one.
    const results = await Promise.all(live.map(async (r) => ({ recipient: r, ...(await this.dispatch(r, lead, ctx)) })));
    await this.logDeliveries(organizationId, rule.id, null, true, results);
    const sent = results.filter((r) => r.status === "sent").length;
    return { ok: true as const, sent, total: results.length };
  }
}
