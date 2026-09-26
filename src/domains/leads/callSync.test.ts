import { describe, it, expect, vi, beforeEach } from "vitest";

const LEAD_CREATED = new Date("2026-09-01T00:00:00Z");
const OLD = new Date("2026-09-10T00:00:00Z");
const baseRows = [
  { id: "lead-own", name: "Ravi", phone: "+919876543210", ownerId: "u1", createdAt: LEAD_CREATED, updatedAt: OLD },
  { id: "lead-other", name: "Asha", phone: "+919000000001", ownerId: "u2", createdAt: LEAD_CREATED, updatedAt: OLD },
];
let leadRows = baseRows;
let queriedPhones: string[] = [];
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => leadRows }) }) }) },
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

import { callerLine, phoneKey, syncDeviceCalls } from "./callSync";

const now = new Date("2026-09-26T12:00:00Z");
const call = (over: Record<string, unknown>) => ({ externalRef: "c", number: "09876543210", direction: "outgoing" as const, startedAt: new Date("2026-09-26T10:00:00Z"), durationSec: 30, ...over });
const run = (calls: ReturnType<typeof call>[], canOpen = async (id: string) => id === "lead-own") =>
  syncDeviceCalls({ organizationId: "org-1", userId: "u1", calls, canOpen, now });

describe("syncDeviceCalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadRows = baseRows;
  });

  it("matches a national-format number to the stored +91 lead and logs it", async () => {
    const res = await run([call({ externalRef: "c1" })]);
    expect(queriedPhones).toContain("+919876543210");
    expect(res).toEqual({ matched: 1, logged: 1, completedFollowUpIds: [] });
    expect(recordLeadContact).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-own", channel: "call", durationSec: 30, externalRef: "c1" }));
  });

  it("ignores numbers that aren't leads, leads the rep can't open, and calls long before the lead existed", async () => {
    const res = await run([
      call({ number: "+14155550000" }),
      call({ number: "+919000000001" }),
      call({ startedAt: new Date("2026-08-30T00:00:00Z") }), // 2 days before the lead
    ]);
    expect(res).toEqual({ matched: 0, logged: 0, completedFollowUpIds: [] });
    expect(recordLeadContact).not.toHaveBeenCalled();
  });

  it("logs the call that made someone a lead (unknown caller added right after)", async () => {
    const res = await run([call({ direction: "incoming", startedAt: new Date("2026-08-31T23:50:00Z") })]);
    expect(res).toEqual({ matched: 1, logged: 1, completedFollowUpIds: [] });
  });

  it("pings the owner about a recent missed call from a lead, not an old one", async () => {
    await run([call({ direction: "incoming", durationSec: 0 })]);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "missed_call", leadId: "lead-own" }));
    notify.mockClear();
    await run([call({ direction: "incoming", durationSec: 0, startedAt: new Date("2026-09-20T10:00:00Z") })]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("with the number on two leads, logs on the most recently active one the rep may open", async () => {
    const dup = (id: string, ownerId: string, updatedAt: string) => ({ id, name: id, phone: "+919876543210", ownerId, createdAt: LEAD_CREATED, updatedAt: new Date(updatedAt) });
    leadRows = [dup("stale", "u1", "2026-09-02T00:00:00Z"), dup("fresh-hidden", "u2", "2026-09-25T00:00:00Z"), dup("fresh", "u1", "2026-09-20T00:00:00Z")];
    await run([call({ externalRef: "d1" })], async (id) => id !== "fresh-hidden");
    expect(recordLeadContact).toHaveBeenCalledWith(expect.objectContaining({ leadId: "fresh" }));
  });

  it("alerts the rep whose phone rang and, when someone else owns the lead, the owner too", async () => {
    await run([call({ number: "+919000000001", direction: "incoming", durationSec: 0 })], async () => true);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", leadId: "lead-other" }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", leadId: "lead-other" }));
  });

  it("doesn't re-notify a call that was already logged", async () => {
    recordLeadContact.mockResolvedValueOnce({ logged: false });
    const res = await run([call({ direction: "incoming", durationSec: 0 })]);
    expect(res).toEqual({ matched: 1, logged: 0, completedFollowUpIds: [] });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("phoneKey", () => {
  it("gives every format of the same number the same key", () => {
    const same = (...xs: string[]) => expect(new Set(xs.map(phoneKey)).size).toBe(1);
    same("+91 98765 43210", "098765-43210", "9876543210");
    same("+971 50 123 4567", "050 123 4567"); // 9-digit national numbers (UAE, Saudi)
    same("+65 8123 4567", "8123 4567"); // 8-digit (Singapore)
    expect(phoneKey("+919876543210")).not.toBe(phoneKey("+919876543211"));
    expect(phoneKey("123")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("callerLine", () => {
  const inr = { currency: "INR", locale: "en-IN" };
  it("shows status and the deal value in compact local units", () => {
    expect(callerLine("Interested", "50000.00", inr)).toBe("Interested · ₹50K");
    expect(callerLine("Negotiation", 150000, inr)).toBe("Negotiation · ₹1.5L");
    expect(callerLine("New", null, inr)).toBe("New");
    expect(callerLine("New", "0", inr)).toBe("New");
    expect(callerLine(null, 2500, { currency: "AED", locale: "en-AE" })).toMatch(/2\.5K/);
  });
});
