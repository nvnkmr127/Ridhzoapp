import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupportTicketService, SupportTicket } from "./supportService";
import { PlatformConfigService } from "./configService";
import { NotificationService } from "@/domains/notifications/service";
import { db } from "@/db";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/domains/notifications/service", () => ({
  NotificationService: {
    create: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("SupportTicketService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a ticket with initial thread message", async () => {
    const store: SupportTicket[] = [];
    vi.mocked(PlatformConfigService.get).mockImplementation(async () => [...store]);
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_, val) => {
      store.length = 0;
      store.push(...(val as SupportTicket[]));
      return val as any;
    });

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ name: "Globex" }, { email: "alice@globex.com" }]),
        }),
      }),
    } as any);

    const ticket = await SupportTicketService.createTicket({
      orgId: "org_1",
      userId: "usr_1",
      subject: "Webhook latency",
      body: "We are seeing 500ms delay in webhooks.",
      category: "technical",
      priority: "high",
    });

    expect(ticket.subject).toBe("Webhook latency");
    expect(ticket.status).toBe("open");
    expect(ticket.priority).toBe("high");
    expect(ticket.messages.length).toBe(1);
    expect(ticket.messages[0].body).toBe("We are seeing 500ms delay in webhooks.");
    expect(store.length).toBe(1);
  });

  it("appends reply from superadmin and dispatches notification to tenant", async () => {
    const existingTicket: SupportTicket = {
      id: "tkt_1",
      orgId: "org_1",
      orgName: "Globex",
      userId: "usr_1",
      userEmail: "alice@globex.com",
      subject: "Webhook latency",
      category: "technical",
      priority: "high",
      status: "open",
      messages: [
        {
          id: "msg_1",
          sender: "tenant",
          senderName: "Alice",
          body: "Initial issue",
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(PlatformConfigService.get).mockResolvedValue([existingTicket]);

    const updated = await SupportTicketService.reply(
      "tkt_1",
      "superadmin",
      "SuperAdmin Staff",
      "We flushed the outbound queue and latency is normal."
    );

    expect(updated).not.toBeNull();
    expect(updated?.messages.length).toBe(2);
    expect(updated?.messages[1].sender).toBe("superadmin");
    expect(updated?.status).toBe("in_progress");
    expect(NotificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "usr_1",
        type: "support_reply",
        title: "Support Reply: Webhook latency",
      })
    );
  });
});
