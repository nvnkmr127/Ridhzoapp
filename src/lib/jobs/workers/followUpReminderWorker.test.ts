import { describe, it, expect, vi, beforeEach } from "vitest";

const due = new Date("2026-09-25T10:00:00Z");
let dueRows: any[] = [];
let activeUsers: { id: string }[] = [];
const inserted: any[] = [];
const notify = vi.fn();

// First select = due follow-ups (…where()), then the active-users lookup (…where()), then the overdue scan (…limit()).
vi.mock("@/db", () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => Object.assign(Promise.resolve(dueRows), { limit: async () => [] }) }),
          where: async () => activeUsers,
        }),
      }),
      insert: () => ({ values: async (v: any) => { inserted.push(v); } }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    },
  };
});
vi.mock("@/domains/notifications/service", () => ({ NotificationService: { create: (...a: any[]) => notify(...a) } }));
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: vi.fn() } }));
vi.mock("@/lib/events/emitter", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("../redis", () => ({ createRedis: vi.fn(), quietErrors: vi.fn() }));
vi.mock("bullmq", () => ({ Worker: vi.fn(), Queue: vi.fn() }));

import { processFollowUpReminderScan } from "./followUpReminderWorker";

const fu = (userId: string | null) => ({
  followUp: { id: "f1", userId, dueAt: due, title: "Call", type: "call" },
  lead: { id: "l1", name: "Ada", ownerId: "owner", organizationId: "org" },
});

describe("follow-up due reminders", () => {
  beforeEach(() => { inserted.length = 0; notify.mockReset(); });

  it("records the reminder against the follow-up's due time (so a snooze reminds again)", async () => {
    dueRows = [fu("rep")];
    activeUsers = [{ id: "rep" }, { id: "owner" }];
    await processFollowUpReminderScan();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "rep" }));
    expect(inserted[0]).toMatchObject({ followUpId: "f1", remindAt: due });
  });

  it("falls back to the lead owner when the assignee is no longer active", async () => {
    dueRows = [fu("gone")];
    activeUsers = [{ id: "owner" }];
    await processFollowUpReminderScan();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner" }));
  });

  it("sends nothing (and doesn't mark it) when nobody active can be told", async () => {
    dueRows = [fu(null)];
    activeUsers = [];
    await processFollowUpReminderScan();
    expect(notify).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});
