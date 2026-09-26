import { describe, it, expect, vi, beforeEach } from "vitest";

// Access rule + contact logging for lead messaging actions.
const getActionableLead = vi.fn();
vi.mock("@/lib/leads/access", () => ({ getActionableLead: (id: string) => getActionableLead(id) }));

const addActivity = vi.fn();
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: (a: unknown) => addActivity(a) } }));

const markLeadContacted = vi.fn();
vi.mock("@/domains/follow-ups/state", () => ({ markLeadContacted: (...a: unknown[]) => markLeadContacted(...a) }));

// Every insert lands here; activity inserts dedupe on externalRef (dupe = the ref is already logged).
// selects: queued results for the "already have this call?" and "hand-logged match?" lookups.
const waInsert = vi.fn();
const update = vi.fn();
let dupe = false;
let selectResults: unknown[][] = [];
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const rows = async () => selectResults.shift() ?? [];
      const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: rows };
      return chain;
    },
    update: () => ({ set: (v: unknown) => ({ where: async () => update(v) }) }),
    insert: () => ({
      values: (v: unknown) => {
        waInsert(v);
        return Object.assign(Promise.resolve(), { onConflictDoNothing: () => ({ returning: async () => (dupe ? [] : [{ id: "act-1" }]) }) });
      },
    }),
  },
}));
vi.mock("@/domains/leads/scoringService", () => ({ ScoringService: { updateLeadScore: async () => {} } }));

const waSend = vi.fn();
vi.mock("@/lib/messaging/whatsapp/service", () => ({ WhatsAppService: { send: (i: unknown) => waSend(i) } }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", () => ({ requireOrg: vi.fn(), requirePermission: vi.fn() }));

import { logLeadContactAction, sendWhatsAppAction } from "./messaging";
import { recordLeadContact } from "@/domains/leads/contactLog";

const LEAD = "6f1c2e0a-1111-4222-8333-444455556666";
const access = { lead: { id: LEAD, email: "a@b.com" }, userId: "u1", organizationId: "org-1" };

describe("lead messaging actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dupe = false;
  });

  it("won't send WhatsApp for a lead the user can't act on (other tenant / not assigned)", async () => {
    getActionableLead.mockResolvedValueOnce(null);
    const res = await sendWhatsAppAction({ leadId: LEAD, body: "hi" });
    expect(res.ok).toBe(false);
    expect(waSend).not.toHaveBeenCalled();
  });

  it("logs a call and marks the lead contacted", async () => {
    getActionableLead.mockResolvedValueOnce(access);
    const res = await logLeadContactAction({ leadId: LEAD, channel: "call", outcome: "no_answer", note: "try after 5" });
    expect(res.ok).toBe(true);
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ type: "call", content: "Called — No answer\nNote: try after 5" }));
    expect(markLeadContacted).toHaveBeenCalledWith(LEAD, undefined);
  });

  it("does not count a wrong number as contact", async () => {
    getActionableLead.mockResolvedValueOnce(access);
    await logLeadContactAction({ leadId: LEAD, channel: "call", outcome: "wrong_number" });
    expect(waInsert).toHaveBeenCalled();
    expect(markLeadContacted).not.toHaveBeenCalled();
  });

  it("puts a personal-mode WhatsApp message in the thread", async () => {
    getActionableLead.mockResolvedValueOnce(access);
    await logLeadContactAction({ leadId: LEAD, channel: "whatsapp", message: "Hi Priya" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, direction: "outbound", body: "Hi Priya", status: "sent" }));
    expect(markLeadContacted).toHaveBeenCalled();
  });

  it("refuses to log contact on a lead the user can't act on", async () => {
    getActionableLead.mockResolvedValueOnce(null);
    const res = await logLeadContactAction({ leadId: LEAD, channel: "email" });
    expect(res.ok).toBe(false);
    expect(waInsert).not.toHaveBeenCalled();
  });
});

describe("calls read from the phone's call log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dupe = false;
    selectResults = [];
  });
  const at = new Date("2026-09-26T10:00:00Z");

  it("derives the outcome from talk time and records it at the call's time", async () => {
    const res = await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", durationSec: 192, startedAt: at, externalRef: "c1" });
    expect(res.logged).toBe(true);
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Called — Answered (3m 12s)", durationSec: 192, externalRef: "c1", occurredAt: at }));
    expect(markLeadContacted).toHaveBeenCalledWith(LEAD, at);
  });

  it("never logs the same device call twice", async () => {
    dupe = true;
    const res = await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", durationSec: 0, externalRef: "c1" });
    expect(res.logged).toBe(false);
    expect(markLeadContacted).not.toHaveBeenCalled();
  });

  it("fills in the rep's hand-logged entry instead of adding the same call twice", async () => {
    selectResults = [[], [{ id: "manual-1", content: "Called — Busy / call back later\nNote: in a meeting" }]];
    const res = await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "outgoing", durationSec: 75, startedAt: at, externalRef: "c9" });
    expect(res.logged).toBe(false);
    expect(waInsert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ externalRef: "c9", durationSec: 75, occurredAt: at, content: "Called — Busy / call back later (1m 15s)\nNote: in a meeting" }));
  });

  it("skips a call it already has without looking for a manual entry", async () => {
    selectResults = [[{ id: "known" }]];
    const res = await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", durationSec: 30, startedAt: at, externalRef: "c1" });
    expect(res.logged).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(waInsert).not.toHaveBeenCalled();
  });

  it("a missed call from the lead is logged but isn't outreach", async () => {
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "incoming", durationSec: 0, externalRef: "c2" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Missed call from lead" }));
    expect(markLeadContacted).not.toHaveBeenCalled();
  });

  it("an answered call from the lead counts as contact", async () => {
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "incoming", durationSec: 45, externalRef: "c3" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Incoming call — Answered (45s)" }));
    expect(markLeadContacted).toHaveBeenCalled();
  });
});
