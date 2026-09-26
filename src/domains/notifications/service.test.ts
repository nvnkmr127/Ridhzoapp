import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: unknown[] = [];
vi.mock("@/db", () => {
  const rows = async () => [{ language: "en", count: 0 }];
  const chain = { from: () => chain, where: () => chain, limit: rows, then: (r: (v: unknown) => unknown) => rows().then(r) };
  return {
    db: {
      select: () => chain,
      insert: () => ({ values: (v: unknown) => ((inserted.push(v)), { returning: async () => [{ id: "n1", ...(v as object) }] }) }),
    },
  };
});
vi.mock("@/lib/i18n", () => ({ t: (_l: unknown, s: string, vars?: Record<string, string>) => s.replace("{name}", vars?.name ?? "") }));
const webPush = vi.fn();
vi.mock("@/lib/push/service", () => ({ PushService: { sendToUser: (...a: unknown[]) => webPush(...a) } }));
const mobilePush = vi.fn(async () => {});
vi.mock("@/lib/push/mobile", () => ({ MobilePushService: { sendToUser: (...a: unknown[]) => mobilePush(...(a as [])) } }));
vi.mock("@/lib/push/channels", () => ({ pushChannelFor: () => "leads" }));

import { NotificationService } from "./service";

const flush = () => new Promise((r) => setTimeout(r, 0));
const missed = { userId: "u1", type: "missed_call", title: "Missed call from {name}", titleVars: { name: "Ravi" }, leadId: "l1" };

describe("NotificationService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserted.length = 0;
  });

  it("stores the notification and pushes it to the phone", async () => {
    await NotificationService.create(missed);
    await flush();
    expect(inserted).toEqual([expect.objectContaining({ userId: "u1", title: "Missed call from Ravi" })]);
    expect(mobilePush).toHaveBeenCalledOnce();
  });

  it("mobilePush: false keeps the bell entry but doesn't push the phone again", async () => {
    await NotificationService.create({ ...missed, mobilePush: false });
    await flush();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).not.toHaveProperty("mobilePush"); // not a column
    expect(mobilePush).not.toHaveBeenCalled();
  });
});
