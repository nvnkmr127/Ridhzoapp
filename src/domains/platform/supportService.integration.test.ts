import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SupportTicketService } from "./supportService";
import { NotificationService } from "@/domains/notifications/service";

vi.mock("@/domains/notifications/service", () => ({ NotificationService: { create: vi.fn().mockResolvedValue(undefined) } }));

// Row locks + FK cascade are the point here — only against a local dev DB.
const RUN = !!process.env.DATABASE_URL?.includes("localhost");
const orgId = crypto.randomUUID();
const userId = crypto.randomUUID();
const stamp = Date.now();

describe.runIf(RUN)("SupportTicketService (support_tickets table)", () => {
  beforeAll(async () => {
    await db.insert(organizations).values({ id: orgId, name: "Globex", slug: `globex-${stamp}` });
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades the tickets
  });

  it("creates a ticket with its first message and an SLA from priority", async () => {
    const t = await SupportTicketService.createTicket({ orgId, userId, subject: "Webhook latency", body: "500ms delay.", priority: "high" });
    expect(t).toMatchObject({ status: "open", priority: "high", orgName: "Globex" });
    expect(new Date(t.slaDeadline).getTime() - new Date(t.createdAt).getTime()).toBe(6 * 3600_000);
    expect((await SupportTicketService.getTicket(t.id))?.messages).toEqual(t.messages);
    expect((await SupportTicketService.listForOrg(orgId)).map((x) => x.id)).toContain(t.id);
  });

  it("a staff reply moves it to in_progress and notifies the tenant; concurrent replies both land", async () => {
    const t = await SupportTicketService.createTicket({ orgId, userId, subject: "SSL", body: "Cert expired." });
    await Promise.all([
      SupportTicketService.reply(t.id, "superadmin", "Staff", "Looking now."),
      SupportTicketService.reply(t.id, "tenant", "Alice", "Thanks!"),
    ]);
    const after = await SupportTicketService.getTicket(t.id);
    expect(after?.messages).toHaveLength(3);
    expect(after?.status).toBe("in_progress");
    expect(NotificationService.create).toHaveBeenCalledWith(expect.objectContaining({ userId, type: "support_reply" }));
  });

  it("assigns, records internal notes, and resolves", async () => {
    const t = await SupportTicketService.createTicket({ orgId, userId, subject: "DNS", body: "CNAME not resolving." });
    expect((await SupportTicketService.assignTicket(t.id, "On-call"))?.assignedTo).toBe("On-call");
    expect((await SupportTicketService.addInternalNote(t.id, "SRE", "propagated"))?.internalNotes).toHaveLength(1);
    expect((await SupportTicketService.updateStatus(t.id, "resolved"))?.status).toBe("resolved");
    expect((await SupportTicketService.listTickets("resolved")).map((x) => x.id)).toContain(t.id);
    expect(await SupportTicketService.assignTicket("tkt_missing", "x")).toBeNull();
  });
});
