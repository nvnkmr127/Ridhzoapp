"use server";

import { requireAuth, requireOrg, requirePermission, assertWritable } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { messageTemplates } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";
import { ok, fail, actionFail } from "@/lib/actions/result";

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
  const session = await requireAuth();
  if (!input.body?.trim() && !input.templateName) {
    return fail("VALIDATION", "Enter a message or choose a template to send.");
  }
  try {
    const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");
    const result = await WhatsAppService.send({ ...input, userId: session.user.id });
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

export async function sendEmailAction(input: z.infer<typeof emailSchema>) {
  const { userId, organizationId } = await assertWritable();
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please provide a subject and message body.");
  const data = parsed.data;

  try {
    const { LeadService } = await import("@/domains/leads/service");
    const lead = await LeadService.getLead(data.leadId, organizationId);
    if (!lead) return fail("NOT_FOUND", "This lead no longer exists or was moved.");
    if (!lead.email) return fail("VALIDATION", "This lead has no email address on file.");

    const { sendEmail } = await import("@/lib/mail/mailer");
    await sendEmail({ to: lead.email, subject: data.subject, html: `<p>${data.body.replace(/\n/g, "<br/>")}</p>` }, organizationId);

    await ActivityService.addActivity({
      leadId: data.leadId,
      userId,
      type: "email",
      content: `[email] ${data.subject}`,
    });
    revalidatePath(`/leads/${data.leadId}`);
    return ok({ sent: true });
  } catch (e) {
    return actionFail(e);
  }
}

// Log that a message was sent so it lands on the lead's activity timeline.
export async function logMessageAction(input: { leadId: string; channel: string; text: string }) {
  const session = await requireAuth();
  await ActivityService.addActivity({
    leadId: input.leadId,
    userId: session.user.id,
    type: "message",
    content: `[${input.channel}] ${input.text}`,
  });
  revalidatePath(`/leads/${input.leadId}`);
}
