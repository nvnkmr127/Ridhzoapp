"use server";

import { requireOrg, requirePermission } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { messageTemplates, whatsappMessages } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";
import { ok, fail, actionFail } from "@/lib/actions/result";
import { getActionableLead } from "@/lib/leads/access";
import { markLeadContacted } from "@/domains/follow-ups/state";

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

const updateSchema = createSchema.extend({ id: z.string().uuid() });

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
  leadId: z.string().uuid(),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendEmailAction(input: z.infer<typeof emailSchema>) {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please provide a subject and message body.");
  const data = parsed.data;

  try {
    const access = await getActionableLead(data.leadId);
    if (!access) return fail("NOT_FOUND", "This lead no longer exists or isn't assigned to you.");
    const { lead, userId, organizationId } = access;
    if (!lead.email) return fail("VALIDATION", "This lead has no email address on file.");

    const { sendEmail } = await import("@/lib/mail/mailer");
    await sendEmail({ to: lead.email, subject: data.subject, html: `<p>${escapeHtml(data.body).replace(/\n/g, "<br/>")}</p>` }, organizationId);

    await ActivityService.addActivity({
      leadId: data.leadId,
      userId,
      type: "email",
      content: `[email] ${data.subject}`,
    });
    await markLeadContacted(data.leadId);
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
const CALL_OUTCOMES = {
  answered: "Answered",
  no_answer: "No answer",
  busy: "Busy / call back later",
  wrong_number: "Wrong number",
} as const;

const logContactSchema = z.object({
  leadId: z.string().uuid(),
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

    let content: string;
    if (channel === "call") {
      content = `Called — ${outcome ? CALL_OUTCOMES[outcome] : "outcome not recorded"}`;
    } else if (channel === "whatsapp") {
      content = message ? `WhatsApp opened with message: ${message}` : "Opened WhatsApp chat";
    } else {
      content = "Opened email to lead";
    }
    if (note) content += `\nNote: ${note}`;

    await ActivityService.addActivity({
      leadId,
      userId: access.userId,
      type: channel === "call" ? "call" : channel === "email" ? "email" : "message",
      content,
    });

    // A wrong number isn't contact with the lead; everything else (even an unanswered call) is an
    // outreach attempt, which is what first-response/SLA timing measures.
    if (outcome !== "wrong_number") await markLeadContacted(leadId);

    // Show personal-mode WhatsApp messages in the lead's WhatsApp thread too. "sent" = handed to the
    // rep's WhatsApp; we can't see delivery for messages that don't go through the Business API.
    if (channel === "whatsapp" && message) {
      await db.insert(whatsappMessages).values({
        leadId,
        userId: access.userId,
        direction: "outbound",
        body: message,
        status: "sent",
      });
    }

    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/");
    return ok({ logged: true });
  } catch (e) {
    return actionFail(e);
  }
}
