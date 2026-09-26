"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrg, requireAuth } from "@/lib/rbac";
import { RateLimiter } from "@/lib/rate-limit";
import { SupportTicketService, type SupportTicket } from "@/domains/platform/supportService";
import { ok, fail, actionFail } from "@/lib/actions/result";

// Tenant side of the support desk: anyone in a workspace can open a ticket and follow the thread.
// Staff-only internal notes are never sent to the tenant.
function forTenant(t: SupportTicket): Omit<SupportTicket, "internalNotes" | "assignedTo"> {
  const rest: Partial<SupportTicket> = { ...t };
  delete rest.internalNotes;
  delete rest.assignedTo;
  return rest as Omit<SupportTicket, "internalNotes" | "assignedTo">;
}

export async function listMySupportTicketsAction() {
  const { organizationId } = await requireOrg();
  const all = await SupportTicketService.listTickets("all");
  return all.filter((t) => t.orgId === organizationId).map(forTenant);
}

const createSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject.").max(150),
  body: z.string().trim().min(10, "Describe the problem in a few words.").max(5000),
  category: z.enum(["billing", "technical", "feature_request", "urgent"]),
});

export async function createSupportTicketAction(input: z.input<typeof createSchema>) {
  const { organizationId, userId, readOnly } = await requireOrg();
  if (readOnly) return fail("FORBIDDEN", "Read-only session.");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the form.");
  const limit = await RateLimiter.checkLimit(`support:create:${organizationId}`, 5, 60 * 60);
  if (!limit.success) return fail("RATE_LIMIT", "You've opened several tickets in the last hour — reply on an existing one instead.");
  try {
    const t = await SupportTicketService.createTicket({
      orgId: organizationId,
      userId,
      ...parsed.data,
      priority: parsed.data.category === "urgent" ? "urgent" : "medium",
    });
    revalidatePath("/settings/support");
    return ok(forTenant(t));
  } catch (e) {
    return actionFail(e);
  }
}

export async function replyMySupportTicketAction(ticketId: string, body: string) {
  const { organizationId, readOnly } = await requireOrg();
  if (readOnly) return fail("FORBIDDEN", "Read-only session.");
  const session = await requireAuth();
  const text = typeof body === "string" ? body.trim() : "";
  if (!text || text.length > 5000) return fail("VALIDATION", "Write a reply (up to 5,000 characters).");
  const existing = await SupportTicketService.getTicket(ticketId);
  if (!existing || existing.orgId !== organizationId) return fail("NOT_FOUND", "Ticket not found.");
  try {
    const name = session.user.name || session.user.email || "Customer";
    const t = await SupportTicketService.reply(ticketId, "tenant", name, text);
    if (!t) return fail("NOT_FOUND", "Ticket not found.");
    revalidatePath("/settings/support");
    return ok(forTenant(t));
  } catch (e) {
    return actionFail(e);
  }
}
