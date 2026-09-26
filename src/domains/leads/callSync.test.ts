import { describe, it, expect, vi, beforeEach } from "vitest";

const LEAD_CREATED = new Date("2026-09-01T00:00:00Z");
const leadRows = [
  { id: "lead-own", name: "Ravi", phone: "+919876543210", ownerId: "u1", createdAt: LEAD_CREATED },
  { id: "lead-other", name: "Asha", phone: "+919000000001", ownerId: "u2", createdAt: LEAD_CREATED },
];
let queriedPhones: string[] = [];
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => leadRows }) }) },
}));
vi.mock("drizzle-orm", async (orig) => {
  const real = await orig<typeof import("drizzle-orm")>();
  return { ...real, inArray: (col: unknown, vals: string[]) => ((queriedPhones = vals), real.inArray(col as never, vals)) };
});
vi.mock("@/lib/leads/orgDialCode", () => ({ orgDialCode: async () => "+91" }));
const recordLeadContact = vi.fn<(a: unknown) => Promise<{ logged: boolean }>>(async () => ({ logged: true }));
vi.mock("./contactLog", () => ({ recordLeadContact: (a: unknown) => recordLeadContact(a) }));
const notify = vi.fn<(a: unknown) => Promise<object>>(async () => ({}));
vi.mock("@/domains/notifications/service", () => ({ NotificationService: { create: (a: unknown) => notify(a) } }));

import { syncDeviceCalls } from "./callSync";

const now = new Date("2026-09-26T12:00:00Z");
const call = (over: Record<string, unknown>) => ({ externalRef: "c", number: "09876543210", direction: "outgoing" as const, startedAt: new Date("2026-09-26T10:00:00Z"), durationSec: 30, ...over });
const run = (calls: ReturnType<typeof call>[], canOpen = async (id: string) => id === "lead-own") =>
  syncDeviceCalls({ organizationId: "org-1", userId: "u1", calls, canOpen, now });

describe("syncDeviceCalls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches a national-format number to the stored +91 lead and logs it", async () => {
    const res = await run([call({ externalRef: "c1" })]);
    expect(queriedPhones).toContain("+919876543210");
    expect(res).toEqual({ matched: 1, logged: 1 });
    expect(recordLeadContact).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-own", channel: "call", durationSec: 30, externalRef: "c1" }));
  });

  it("ignores numbers that aren't leads, leads the rep can't open, and calls before the lead existed", async () => {
    const res = await run([
      call({ number: "+14155550000" }),
      call({ number: "+919000000001" }),
      call({ startedAt: new Date("2026-08-01T00:00:00Z") }),
    ]);
    expect(res).toEqual({ matched: 0, logged: 0 });
    expect(recordLeadContact).not.toHaveBeenCalled();
  });

  it("pings the owner about a recent missed call from a lead, not an old one", async () => {
    await run([call({ direction: "incoming", durationSec: 0 })]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "missed_call", leadId: "lead-own" }));
    notify.mockClear();
    await run([call({ direction: "incoming", durationSec: 0, startedAt: new Date("2026-09-20T10:00:00Z") })]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("doesn't re-notify a call that was already logged", async () => {
    recordLeadContact.mockResolvedValueOnce({ logged: false });
    const res = await run([call({ direction: "incoming", durationSec: 0 })]);
    expect(res).toEqual({ matched: 1, logged: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});
