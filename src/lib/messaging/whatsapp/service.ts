import { db } from "@/db";
import { leads, whatsappMessages, organizations } from "@/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { WatxioClient } from "./client";
import { renderTemplate, type LeadLike } from "../deeplink";
import { ActivityService } from "@/domains/activities/service";
import { markLeadContacted } from "@/domains/follow-ups/state";

export interface SendWhatsAppInput {
  leadId: string;
  userId?: string; // null when sent by an automation
  // Free-form text — used only if the lead is inside the 24h window.
  body?: string;
  // Approved template — required outside the window (e.g. first contact with a new lead).
  templateName?: string;
  variables?: string[]; // template {{1}},{{2}}... — values may contain lead tokens like {{first_name}}
  languageCode?: string; // template language, default en_US
}

// A new lead has never messaged us, so we're outside the 24h window and must send a template.
// The window opens only when the lead has an inbound WhatsApp message in the last 24h.
// (Inbound isn't recorded yet in this slice, so this correctly returns false until it is.)
async function insideWindow(leadId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(and(
      eq(whatsappMessages.leadId, leadId),
      eq(whatsappMessages.direction, "inbound"),
      gt(whatsappMessages.createdAt, since),
    ))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(1);
  return !!row;
}

// Pure decision: given the window state and what the caller supplied, what do we send?
// Template wins outside the window (and when no free text given); free text needs the window open.
export function chooseSend(
  canFreeform: boolean,
  opts: { body?: string; templateName?: string },
): { mode: "template" | "text" } | { error: string } {
  const useTemplate = !!opts.templateName && (!canFreeform || !opts.body);
  if (useTemplate) return { mode: "template" };
  if (!canFreeform) return { error: "Outside 24h window: an approved templateName is required to message this lead" };
  if (!opts.body) return { error: "Nothing to send: provide body or templateName" };
  return { mode: "text" };
}

export const WhatsAppService = {
  // Full thread for a lead, oldest first — drives the conversation view.
  async listForLead(leadId: string) {
    return db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.leadId, leadId))
      .orderBy(whatsappMessages.createdAt);
  },

  async send(input: SendWhatsAppInput) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    if (!lead) throw new Error(`Lead ${input.leadId} not found`);
    if (!lead.phone) throw new Error(`Lead ${input.leadId} has no phone number`);

    // Respect the org's WhatsApp mode: only "bsp" tenants send through the Business API here. In
    // "personal" mode reps send via one-tap wa.me links from the UI, so an automated/API BSP send
    // must NOT go out — surfacing "not configured" makes the sequence worker log a manual-send note
    // rather than silently dispatching from the shared BSP number against the tenant's choice.
    if (lead.organizationId) {
      const [org] = await db
        .select({ mode: organizations.whatsappMode })
        .from(organizations)
        .where(eq(organizations.id, lead.organizationId))
        .limit(1);
      if (org && org.mode !== "bsp") {
        throw new Error("WhatsApp Business API not configured (personal mode)");
      }
    }

    const leadLike: LeadLike = lead;
    const canFreeform = await insideWindow(input.leadId);

    const decision = chooseSend(canFreeform, input);
    if ("error" in decision) throw new Error(decision.error);
    const useTemplate = decision.mode === "template";

    // Render token placeholders ({{first_name}} etc.) against the lead.
    const renderedBody = input.body ? renderTemplate(input.body, leadLike) : null;
    const renderedVars = (input.variables ?? []).map((v) => renderTemplate(v, leadLike));

    // Log first as queued so a crash mid-send still leaves a trace.
    const [msg] = await db.insert(whatsappMessages).values({
      leadId: input.leadId,
      userId: input.userId,
      direction: "outbound",
      templateName: useTemplate ? input.templateName : null,
      body: useTemplate ? `[template:${input.templateName}] ${renderedVars.join(" | ")}` : renderedBody,
      status: "queued",
    }).returning();

    try {
      const result = useTemplate
        ? await WatxioClient.sendTemplate(lead.phone, input.templateName!, renderedVars, input.languageCode, msg.id)
        : await WatxioClient.sendText(lead.phone, renderedBody!, msg.id);

      await db.update(whatsappMessages)
        .set({ status: result.status, providerMessageId: result.providerMessageId, updatedAt: new Date() })
        .where(eq(whatsappMessages.id, msg.id));

      await markLeadContacted(input.leadId);

      await ActivityService.addActivity({
        leadId: input.leadId,
        userId: input.userId,
        type: "message",
        content: `[whatsapp] ${msg.body}`,
      });

      return { messageId: msg.id, providerMessageId: result.providerMessageId };
    } catch (err: any) {
      await db.update(whatsappMessages)
        .set({ status: "failed", error: err.message ?? String(err), updatedAt: new Date() })
        .where(eq(whatsappMessages.id, msg.id));
      throw err;
    }
  },

  // Delivery receipt from Watxio: advance an outbound message's status.
  // Guarded so an out-of-order webhook can't flip "read" back to "delivered".
  async updateStatus(providerMessageId: string, status: string) {
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 3 };
    const [row] = await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.providerMessageId, providerMessageId)).limit(1);
    if (!row) return; // status for a message we didn't send / already gone
    if ((rank[status] ?? -1) <= (rank[row.status] ?? -1) && status !== "failed") return;
    await db.update(whatsappMessages)
      .set({ status, updatedAt: new Date() })
      .where(eq(whatsappMessages.id, row.id));
  },

  // Inbound reply from the lead. Matches by phone (digits), logs it, opens the 24h window.
  // Returns whether it landed on a known lead.
  async recordInbound(input: { fromPhone: string; providerMessageId: string; body: string; organizationId?: string }) {
    const digits = input.fromPhone.replace(/\D/g, "");
    if (!digits) return { matched: false };

    const conditions = [sql`regexp_replace(${leads.phone}, '\\D', '', 'g') = ${digits}`];
    if (input.organizationId) {
      conditions.push(eq(leads.organizationId, input.organizationId));
    }

    const [lead] = await db.select().from(leads)
      .where(and(...conditions))
      .limit(1);
    if (!lead) return { matched: false };

    await db.insert(whatsappMessages).values({
      leadId: lead.id,
      direction: "inbound",
      providerMessageId: input.providerMessageId,
      body: input.body,
      status: "received",
    });
    await ActivityService.addActivity({
      leadId: lead.id,
      type: "message",
      content: `[whatsapp ← lead] ${input.body}`,
    });
    // A reply means the lead is engaged — stop any running drip so we don't keep auto-messaging.
    const { SequenceService } = await import("@/domains/leads/sequenceService");
    await SequenceService.stopForLead(lead.id, "lead replied on WhatsApp").catch(() => {});
    return { matched: true, leadId: lead.id, organizationId: lead.organizationId };
  },
};
