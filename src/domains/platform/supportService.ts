import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PlatformConfigService } from "./configService";
import { NotificationService } from "@/domains/notifications/service";

export interface TicketMessage {
  id: string;
  sender: "tenant" | "superadmin";
  senderName: string;
  body: string;
  createdAt: string;
}

export interface InternalNote {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  subject: string;
  category: "billing" | "technical" | "feature_request" | "urgent";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved";
  assignedTo?: string | null;
  slaDeadline: string;
  messages: TicketMessage[];
  internalNotes?: InternalNote[];
  createdAt: string;
  updatedAt: string;
}

const SUPPORT_CONFIG_KEY = "support_tickets";

const SLA_HOURS: Record<string, number> = {
  urgent: 2,
  high: 6,
  medium: 24,
  low: 48,
};

export class SupportTicketService {
  static async listTickets(statusFilter = "all"): Promise<SupportTicket[]> {
    const list = await PlatformConfigService.get<SupportTicket[]>(SUPPORT_CONFIG_KEY, []);
    if (statusFilter === "all") return list;
    return list.filter((t) => t.status === statusFilter);
  }

  static async getTicket(id: string): Promise<SupportTicket | null> {
    const list = await this.listTickets("all");
    return list.find((t) => t.id === id) ?? null;
  }

  static async createTicket(input: {
    orgId: string;
    userId: string;
    subject: string;
    body: string;
    category?: "billing" | "technical" | "feature_request" | "urgent";
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

    const list = await PlatformConfigService.get<SupportTicket[]>(SUPPORT_CONFIG_KEY, []);
    list.unshift(ticket);
    await PlatformConfigService.set(SUPPORT_CONFIG_KEY, list);
    return ticket;
  }

  static async assignTicket(ticketId: string, assignedTo: string | null): Promise<SupportTicket | null> {
    const list = await PlatformConfigService.get<SupportTicket[]>(SUPPORT_CONFIG_KEY, []);
    const ticket = list.find((t) => t.id === ticketId);
    if (!ticket) return null;
    ticket.assignedTo = assignedTo;
    ticket.updatedAt = new Date().toISOString();
    await PlatformConfigService.set(SUPPORT_CONFIG_KEY, list);
    return ticket;
  }

  static async addInternalNote(ticketId: string, authorName: string, body: string): Promise<SupportTicket | null> {
    const list = await PlatformConfigService.get<SupportTicket[]>(SUPPORT_CONFIG_KEY, []);
    const ticket = list.find((t) => t.id === ticketId);
    if (!ticket) return null;
    ticket.internalNotes = ticket.internalNotes ?? [];
    ticket.internalNotes.push({
      id: `note_${Date.now()}`,
      authorName,
      body,
      createdAt: new Date().toISOString(),
    });
    ticket.updatedAt = new Date().toISOString();
    await PlatformConfigService.set(SUPPORT_CONFIG_KEY, list);
    return ticket;
  }

  static async reply(
    ticketId: string,
    sender: "superadmin" | "tenant",
    senderName: string,
    body: string
  ): Promise<SupportTicket | null> {
    const list = await PlatformConfigService.get<SupportTicket[]>(SUPPORT_CONFIG_KEY, []);
    const ticket = list.find((t) => t.id === ticketId);
    if (!ticket) return null;

    const now = new Date().toISOString();
    ticket.messages.push({
      id: `msg_${Date.now()}`,
      sender,
      senderName,
      body,
      createdAt: now,
    });
    ticket.updatedAt = now;
    if (sender === "superadmin" && ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await PlatformConfigService.set(SUPPORT_CONFIG_KEY, list);

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
    }

    return ticket;
  }

  static async updateStatus(ticketId: string, status: "open" | "in_progress" | "resolved"): Promise<SupportTicket | null> {
    const list = await PlatformConfigService.get<SupportTicket[]>(SUPPORT_CONFIG_KEY, []);
    const ticket = list.find((t) => t.id === ticketId);
    if (!ticket) return null;

    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    await PlatformConfigService.set(SUPPORT_CONFIG_KEY, list);

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
    }

    return ticket;
  }
}
