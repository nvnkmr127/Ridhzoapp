import { describe, expect, it, vi, beforeEach } from "vitest";
import { WebhookDlqService } from "./webhookDlqService";
import { db } from "@/db";

// The DLQ is now backed by the shared `webhook_deliveries` table (so web + worker see one state).
vi.mock("@/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

describe("WebhookDlqService (Postgres-backed)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps failed delivery rows into DlqItems, scoped by the query", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const rows = [
      { id: "d1", eventId: "evt_1", event: "lead.created", url: "https://x/y", updatedAt: now, createdAt: now, errorReason: "HTTP 500", attempts: 5, payload: { organizationId: "org-1" } },
    ];
    (db.select as any).mockReturnValue({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) });

    const items = await WebhookDlqService.getFailedDlqJobs("org-1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ jobId: "d1", eventId: "evt_1", attemptCount: 5, errorReason: "HTTP 500", endpointUrl: "https://x/y" });
  });

  it("purge throws when no row matches the org", async () => {
    (db.delete as any).mockReturnValue({ where: () => ({ returning: () => Promise.resolve([]) }) });
    await expect(WebhookDlqService.purgeDlqJob("nope", "org-1")).rejects.toThrow(/not found/i);
  });

  it("purge succeeds when a row is deleted", async () => {
    (db.delete as any).mockReturnValue({ where: () => ({ returning: () => Promise.resolve([{ id: "d1" }]) }) });
    const res = await WebhookDlqService.purgeDlqJob("d1", "org-1");
    expect(res.success).toBe(true);
  });

  it("retry throws when the delivery isn't found for the org", async () => {
    (db.select as any).mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
    await expect(WebhookDlqService.retryDlqJob("nope", "org-1")).rejects.toThrow(/not found/i);
  });

  it("records a pending delivery and returns its id", async () => {
    (db.insert as any).mockReturnValue({ values: () => ({ returning: () => Promise.resolve([{ id: "new-id" }]) }) });
    const id = await WebhookDlqService.recordPending({
      organizationId: "org-1", endpointId: "ep-1", eventId: "evt_1", event: "lead.created", url: "https://x/y",
      payload: { version: "1", eventId: "evt_1", event: "lead.created", timestamp: "", organizationId: "org-1", data: {} },
    });
    expect(id).toBe("new-id");
  });
});
