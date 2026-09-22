import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueueOfflineLead,
  getOfflineOutbox,
  removeOfflineLead,
  clearOfflineOutbox,
  flushOfflineOutbox,
} from "./outbox";
import { createLeadAction } from "@/lib/actions/leads";

vi.mock("@/lib/actions/leads", () => ({
  createLeadAction: vi.fn(),
}));

const store = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, String(value));
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
};
vi.stubGlobal("localStorage", localStorageMock);

describe("Offline Outbox Sync", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
  });

  it("enqueues a lead to local storage", () => {
    const item = enqueueOfflineLead({ name: "Alex Chen", phone: "+919876543210" });
    expect(item.payload.name).toBe("Alex Chen");
    expect(item.id).toMatch(/^offline_/);

    const outbox = getOfflineOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload.name).toBe("Alex Chen");
  });

  it("removes a specific lead by id", () => {
    const item1 = enqueueOfflineLead({ name: "Lead 1" });
    const item2 = enqueueOfflineLead({ name: "Lead 2" });

    expect(getOfflineOutbox()).toHaveLength(2);
    removeOfflineLead(item1.id);

    const remaining = getOfflineOutbox();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(item2.id);
  });

  it("clears all leads from outbox", () => {
    enqueueOfflineLead({ name: "Lead 1" });
    enqueueOfflineLead({ name: "Lead 2" });
    clearOfflineOutbox();
    expect(getOfflineOutbox()).toEqual([]);
  });

  it("flushes outbox and removes successfully synced leads", async () => {
    vi.mocked(createLeadAction).mockResolvedValueOnce({
      ok: true,
      data: { id: "lead-server-1", name: "Lead 1" } as any,
    });

    const item = enqueueOfflineLead({ name: "Lead 1", email: "lead1@example.com" });
    const onSynced = vi.fn();

    const result = await flushOfflineOutbox(onSynced);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(onSynced).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }));
    expect(getOfflineOutbox()).toHaveLength(0);
  });

  it("drops duplicate lead errors so queue does not get blocked", async () => {
    vi.mocked(createLeadAction).mockResolvedValueOnce({
      ok: false,
      code: "CONFLICT",
      message: "A lead with this email already exists.",
    });

    enqueueOfflineLead({ name: "Duplicate Lead", email: "dup@example.com" });
    const result = await flushOfflineOutbox();

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].name).toBe("Duplicate Lead");
    expect(getOfflineOutbox()).toHaveLength(0);
  });

  it("syncs both offline leads even when the older one duplicates the newer (server 'already used' wording)", async () => {
    // Newest is processed first and succeeds; the older same-contact lead comes back as a
    // CONFLICT worded "already used by lead X" — must still be dropped, not stuck in the queue.
    vi.mocked(createLeadAction)
      .mockResolvedValueOnce({ ok: true, data: { id: "lead-1" } as any })
      .mockResolvedValueOnce({
        ok: false,
        code: "CONFLICT",
        message: 'Duplicate phone number: already used by lead "Newer"',
      });

    enqueueOfflineLead({ name: "Older", phone: "+919876543210" });
    enqueueOfflineLead({ name: "Newer", phone: "+919876543210" });

    const result = await flushOfflineOutbox();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].name).toBe("Older");
    expect(getOfflineOutbox()).toHaveLength(0);
  });

  it("keeps failed leads in queue when server returns non-duplicate error", async () => {
    vi.mocked(createLeadAction).mockResolvedValueOnce({
      ok: false,
      code: "SERVER",
      message: "Server internal error",
    });

    enqueueOfflineLead({ name: "Failing Lead" });
    const result = await flushOfflineOutbox();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(getOfflineOutbox()).toHaveLength(1);
  });
});
