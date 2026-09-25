"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { messageTemplates } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { getActionableLead } from "@/lib/leads/access";
import { recordLeadContact, recordLeadReply } from "@/domains/leads/contactLog";

export async function listTemplates(channel?: string) {
  const { organizationId } = await requireOrg();
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.organizationId, organizationId))
    .orderBy(desc(messageTemplates.createdAt));
  return channel ? rows.filter((t) => t.channel === channel) : rows;
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  channel: z.enum(["whatsapp", "sms", "email"]),
  subject: z.string().max(255).optional(),
  body: z.string().min(1),
});

export async function createTemplateAction(input: z.infer<typeof createSchema>) {
  const { organizationId } = await requirePermission("templates.manage");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please provide a name, channel, and message body.");
  try {
    const [row] = await db.insert(messageTemplates).values({ ...parsed.data, organizationId }).returning();
    revalidatePath("/templates");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

const updateSchema = createSchema.extend({ id: z.guid() });

export async function updateTemplateAction(input: z.infer<typeof updateSchema>) {
  const { organizationId } = await requirePermission("templates.manage");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please provide a name, channel, and message body.");
  const { id, ...data } = parsed.data;
  try {
    const [row] = await db
      .update(messageTemplates)
      .set(data)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.organizationId, organizationId)))
      .returning();
    if (!row) return fail("NOT_FOUND", "This template no longer exists.");
    revalidatePath("/templates");
    return ok(row);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteTemplateAction(id: string) {
  const { organizationId } = await requirePermission("templates.manage");
  try {
    await db
      .delete(messageTemplates)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.organizationId, organizationId)));
    revalidatePath("/templates");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}

// Send a WhatsApp message via Watxio (server-side send, not a deep link).
// Free-form `body` works only inside the 24h window; otherwise pass a `templateName`.
export async function sendWhatsAppAction(input: {
  leadId: string;
  body?: string;
  templateName?: string;
  variables?: string[];
}) {
  if (!input.body?.trim() && !input.templateName) {
    return fail("VALIDATION", "Enter a message or choose a template to send.");
  }
  try {
    const access = await getActionableLead(input.leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or isn't assigned to you.");
    const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");
    const result = await WhatsAppService.send({ ...input, userId: access.userId });
    revalidatePath(`/leads/${input.leadId}`);
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

// Send an email to a lead and log it on the timeline. Uses the shared mailer (dev-safe).
const emailSchema = z.object({
  leadId: z.guid(),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
});


export async function sendEmailAction(input: z.infer<typeof emailSchema>) {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please provide a subject and message body.");
  const data = parsed.data;

  try {
    const access = await getActionableLead(data.leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or isn't assigned to you.");
    const { lead, userId, organizationId } = access;
    if (!lead.email) return fail("VALIDATION", "This lead has no email address on file.");

    const { sendLeadEmail } = await import("@/domains/leads/leadActions");
    await sendLeadEmail({ leadId: data.leadId, userId, organizationId, to: lead.email, subject: data.subject, body: data.body });
    revalidatePath(`/leads/${data.leadId}`);
    return ok({ sent: true });
  } catch (e) {
    return actionFail(e);
  }
}

// Record an outreach the rep did OUTSIDE Ridhzo — a phone call, a message sent from their own
// WhatsApp (personal mode opens wa.me), or an email from their own mail app. Without this, personal-
// mode contact left no trace: no timeline entry and no last_contacted_at, so response-time/SLA
// metrics, the Next Best Action and cold-lead detection all treated contacted leads as untouched.
const logContactSchema = z.object({
  leadId: z.guid(),
  channel: z.enum(["call", "whatsapp", "email"]),
  outcome: z.enum(["answered", "no_answer", "busy", "wrong_number"]).optional(),
  note: z.string().trim().max(2000).optional(),
  message: z.string().trim().max(4000).optional(), // text prefilled into WhatsApp, if any
});

export async function logLeadContactAction(input: z.infer<typeof logContactSchema>) {
  const parsed = logContactSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Couldn't log this contact. Please try again.");
  const { leadId, channel, outcome, note, message } = parsed.data;

  try {
    const access = await getActionableLead(leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or isn't assigned to you.");

    await recordLeadContact({ leadId, userId: access.userId, channel, outcome, note, message });
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/");
    return ok({ logged: true });
  } catch (e) {
    return actionFail(e);
  }
}

// "They replied" — in personal WhatsApp mode Ridhzo can't see incoming messages, so the rep pastes
// the lead's reply. It lands in the WhatsApp thread as inbound (so the AI and scoring see real
// intent) and stops any running sequence, exactly like a Business API inbound message would.
const logReplySchema = z.object({
  leadId: z.guid(),
  channel: z.enum(["whatsapp", "email", "call"]).default("whatsapp"),
  message: z.string().trim().min(1, "Paste or type what they said.").max(4000),
});

export async function logLeadReplyAction(input: z.infer<typeof logReplySchema>) {
  const parsed = logReplySchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Paste or type what they said.");
  const { leadId, channel, message } = parsed.data;
  try {
    const access = await getActionableLead(leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or isn't assigned to you.");

    await recordLeadReply({ leadId, userId: access.userId, channel, message });

    revalidatePath(`/leads/${leadId}`);
    return ok({ logged: true });
  } catch (e) {
    return actionFail(e);
  }
}
