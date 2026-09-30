import { db } from "@/db";
import { organizations, users, supportTickets, type TicketMessage, type InternalNote } from "@/db/schema";
import { and, count, desc, eq, isNull, lt, ne } from "drizzle-orm";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { mh, mp, mbtn, mfine, mquote, mtag } from "@/lib/mail/layout";
import { NotificationService } from "@/domains/notifications/service";

export type { TicketMessage, InternalNote };

export interface SupportTicket {
  id: string;
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  subject: string;
  category: "billing" | "technical" | "feature_request" | "integration_request" | "urgent";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved";
  assignedTo?: string | null;
  slaDeadline: string;
  messages: TicketMessage[];
  internalNotes?: InternalNote[];
  createdAt: string;
  updatedAt: string;
}

type TicketRow = typeof supportTickets.$inferSelect;

const toTicket = (r: TicketRow): SupportTicket => ({
  ...r,
  category: r.category as SupportTicket["category"],
  priority: r.priority as SupportTicket["priority"],
  status: r.status as SupportTicket["status"],
  slaDeadline: r.slaDeadline.toISOString(),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const label = (c: string) => c.replace("_", " ");

// Best-effort email to the ticket owner (platform mailer, never the tenant's SMTP). Never blocks the caller.
async function emailOwner(t: SupportTicket, subject: string, lead: string, body?: string) {
  try {
    await sendEmail({ from: "hello",
      to: t.userEmail,
      subject,
      preheader: esc(lead),
      html: mtag("Support") + mh("We've replied.") + mp(esc(lead)) + (body ? mquote(esc(body)) : "") + mbtn("Open your support requests", appUrl("/settings/support")) + mfine("Just reply to this email to reach our team."),
    });
  } catch (err) {
    console.warn("[supportService] failed to email ticket owner", err);
  }
}

async function opsAlert(event: string, title: string, message: string) {
  try {
    const { OpsAlertService } = await import("./opsAlertService");
    await OpsAlertService.dispatchAlert(event, title, message);
  } catch {
    // never block a ticket action on an alert
  }
}

const SLA_HOURS: Record<string, number> = {
  urgent: 2,
  high: 6,
  medium: 24,
  low: 48,
};

export class SupportTicketService {
  // ponytail: unpaginated; add a limit/cursor when the desk holds thousands of tickets.
  static async listTickets(statusFilter = "all"): Promise<SupportTicket[]> {
    const q = db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
    const rows = statusFilter === "all" ? await q : await q.where(eq(supportTickets.status, statusFilter));
    return rows.map(toTicket);
  }

  static async countOpen(): Promise<number> {
    const [row] = await db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, "open"));
    return Number(row?.n ?? 0);
  }

  static async listForOrg(orgId: string): Promise<SupportTicket[]> {
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.orgId, orgId)).orderBy(desc(supportTickets.createdAt));
    return rows.map(toTicket);
  }

  static async getTicket(id: string): Promise<SupportTicket | null> {
    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    return row ? toTicket(row) : null;
  }

  static async createTicket(input: {
    orgId: string;
    userId: string;
    subject: string;
    body: string;
    category?: "billing" | "technical" | "feature_request" | "integration_request" | "urgent";
    priority?: "low" | "medium" | "high" | "urgent";
  }): Promise<SupportTicket> {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, input.orgId)).limit(1);
    const [user] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, input.userId)).limit(1);

    const senderName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Tenant User";
    const now = new Date();
    const priority = input.priority ?? "medium";
    const slaHours = SLA_HOURS[priority] ?? 24;
    const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000).toISOString();

    const ticket: SupportTicket = {
      id: `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orgId: input.orgId,
      orgName: org?.name ?? "Organization",
      userId: input.userId,
      userEmail: user?.email ?? "unknown",
      subject: input.subject,
      category: input.category ?? "technical",
      priority,
      status: "open",
      assignedTo: null,
      slaDeadline,
      internalNotes: [],
      messages: [
        {
          id: `msg_${Date.now()}`,
          sender: "tenant",
          senderName,
          body: input.body,
          createdAt: now.toISOString(),
        },
      ],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await db.insert(supportTickets).values({
      ...ticket,
      slaDeadline: new Date(ticket.slaDeadline),
      createdAt: now,
      updatedAt: now,
    });
    // Best-effort ping to the ops channel (Zoho Cliq) so new tickets don't sit unseen.
    await opsAlert(
      "support.new",
      `New ${label(ticket.category)} ticket (${ticket.priority})`,
      `*${ticket.orgName}* — ${ticket.subject}\n${input.body.slice(0, 300)}`,
    );
    return ticket;
  }

  // Change one ticket under a row lock (two replies at once both land). Returns the updated ticket,
  // or null if it doesn't exist.
  private static async mutate(ticketId: string, fn: (t: SupportTicket) => void): Promise<SupportTicket | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update").limit(1);
      if (!row) return null;
      const t = toTicket(row);
      fn(t);
      const now = new Date();
      t.updatedAt = now.toISOString();
      await tx
        .update(supportTickets)
        .set({ status: t.status, assignedTo: t.assignedTo ?? null, messages: t.messages, internalNotes: t.internalNotes ?? [], updatedAt: now })
        .where(eq(supportTickets.id, ticketId));
      return t;
    });
  }

  static async assignTicket(ticketId: string, assignedTo: string | null): Promise<SupportTicket | null> {
    return this.mutate(ticketId, (t) => { t.assignedTo = assignedTo; });
  }

  static async addInternalNote(ticketId: string, authorName: string, body: string): Promise<SupportTicket | null> {
    return this.mutate(ticketId, (t) => {
      t.internalNotes = t.internalNotes ?? [];
      t.internalNotes.push({ id: `note_${Date.now()}`, authorName, body, createdAt: new Date().toISOString() });
    });
  }

  static async reply(
    ticketId: string,
    sender: "superadmin" | "tenant",
    senderName: string,
    body: string
  ): Promise<SupportTicket | null> {
    const ticket = await this.mutate(ticketId, (t) => {
      t.messages.push({ id: `msg_${Date.now()}`, sender, senderName, body, createdAt: new Date().toISOString() });
      if (sender === "superadmin" && t.status === "open") t.status = "in_progress";
    });
    if (!ticket) return null;

    // If superadmin replied, notify the tenant user
    if (sender === "superadmin") {
      try {
        await NotificationService.create({
          userId: ticket.userId,
          type: "support_reply",
          title: `Support Reply: ${ticket.subject}`,
          body: body.slice(0, 100),
        });
      } catch (err) {
        console.warn("[supportService] failed to notify user of support reply", err);
      }
      await emailOwner(ticket, `Re: ${ticket.subject}`, "Ridhzo support replied to your request:", body);
    } else {
      await opsAlert("support.reply", "Tenant replied on a ticket", `*${ticket.orgName}* — ${ticket.subject}\n${body.slice(0, 300)}`);
    }

    return ticket;
  }

  static async updateStatus(ticketId: string, status: "open" | "in_progress" | "resolved"): Promise<SupportTicket | null> {
    const ticket = await this.mutate(ticketId, (t) => { t.status = status; });
    if (!ticket) return null;

    if (status === "resolved") {
      try {
        await NotificationService.create({
          userId: ticket.userId,
          type: "support_resolved",
          title: `Ticket Resolved: ${ticket.subject}`,
          body: "Your support request has been marked resolved by our engineering team.",
        });
      } catch {
        // ignore
      }
      await emailOwner(ticket, `Resolved: ${ticket.subject}`, "Your support request has been marked resolved. Reply on the ticket if you still need help.");
    }

    return ticket;
  }

  // Worker scan: alert once per ticket that is still unresolved past its SLA deadline.
  // Claims each row first (slaAlertedAt) so two workers can't double-post.
  static async alertSlaBreaches(): Promise<number> {
    const due = await db.select().from(supportTickets)
      .where(and(ne(supportTickets.status, "resolved"), lt(supportTickets.slaDeadline, new Date()), isNull(supportTickets.slaAlertedAt)))
      .limit(50);
    let sent = 0;
    for (const r of due) {
      const claimed = await db.update(supportTickets).set({ slaAlertedAt: new Date() })
        .where(and(eq(supportTickets.id, r.id), isNull(supportTickets.slaAlertedAt))).returning({ id: supportTickets.id });
      if (!claimed.length) continue;
      const hours = Math.max(1, Math.round((Date.now() - r.slaDeadline.getTime()) / 3_600_000));
      await opsAlert("sla.support_ticket", `Support SLA missed (${r.priority})`, `*${r.orgName}* — ${r.subject}\nOpen ${hours}h past its response deadline.`);
      sent++;
    }
    return sent;
  }
}
