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
      const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, orderBy: () => chain, limit: rows };
      return chain;
    },
    update: () => ({ set: (v: unknown) => ({ where: async () => update(v) }) }),
    insert: () => ({
      values: (v: unknown) => {
        waInsert(v);
        return Object.assign(Promise.resolve(), {
          onConflictDoNothing: () => ({ returning: async () => (dupe ? [] : [{ id: "act-1" }]) }),
          returning: async () => [{ id: "row-1" }],
        });
      },
    }),
  },
}));
vi.mock("@/domains/leads/scoringService", async (orig) => {
  const { ScoringService } = await orig<typeof import("@/domains/leads/scoringService")>();
  return { ScoringService: { updateLeadScore: async () => {}, callStats: ScoringService.callStats.bind(ScoringService) } };
});

const createFollowUp = vi.fn();
vi.mock("@/domains/follow-ups/service", () => ({ FollowUpService: { createFollowUp: (a: unknown) => createFollowUp(a), completeFollowUp: vi.fn() } }));

const waSend = vi.fn();
vi.mock("@/lib/messaging/whatsapp/service", () => ({ WhatsAppService: { send: (i: unknown) => waSend(i) } }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", () => ({ requireOrg: vi.fn(), requirePermission: vi.fn() }));

import { logLeadContactAction, sendWhatsAppAction } from "./messaging";
import { recordLeadContact } from "@/domains/leads/contactLog";
import { eventBus } from "@/lib/events/emitter";

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

  it("tells automations about the call, with the unanswered run including this one", async () => {
    const emitted = vi.fn();
    eventBus.on("call.logged", emitted);
    // no known ref, no manual match, then the lead's recent calls (newest first)
    selectResults = [[], [], [{ type: "call", content: "Called — No answer" }, { type: "call", content: "Called — Busy / call back later" }, { type: "call", content: "Called — Answered" }]];
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "outgoing", durationSec: 0, startedAt: at, externalRef: "c7" });
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, call: expect.objectContaining({ activityId: "act-1", outcome: "no_answer", unansweredStreak: 2 }) }));
    eventBus.off("call.logged", emitted);
  });

  it("a missed call from the lead is logged but isn't outreach, and books one callback", async () => {
    // recent calls, workspace timezone, no open callback yet, then the lead's name/owner
    selectResults = [[], [{ timezone: "Asia/Kolkata" }], [], [{ name: "Ravi Kumar", ownerId: "u2" }]];
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "incoming", durationSec: 0, externalRef: "c2" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Missed call from lead" }));
    expect(markLeadContacted).not.toHaveBeenCalled();
    expect(createFollowUp).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, type: "call", title: "Call back Ravi Kumar", userId: "u2" }));
  });

  it("doesn't book a callback for a week-old missed call (first sync backfills the last week)", async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "incoming", durationSec: 0, startedAt: weekAgo, externalRef: "c5" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Missed call from lead" }));
    expect(createFollowUp).not.toHaveBeenCalled();
  });

  it("puts the rep's outcome and note on a call the background sync already logged", async () => {
    selectResults = [[{ id: "synced", content: "Called — Answered (1m 15s)" }]];
    const res = await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "outgoing", outcome: "busy", note: "in a meeting", durationSec: 75, startedAt: at, externalRef: "c6" });
    expect(res.logged).toBe(false);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ content: "Called — Busy / call back later (1m 15s)\nNote: in a meeting" }));
    expect(waInsert).not.toHaveBeenCalled();
  });

  it("doesn't pile up callbacks when the lead calls again before the rep calls back", async () => {
    selectResults = [[], [{ timezone: "Asia/Kolkata" }], [{ id: "open-callback" }]];
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "incoming", durationSec: 0, externalRef: "c4" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Missed call from lead" }));
    expect(createFollowUp).not.toHaveBeenCalled();
  });

  it("an answered call from the lead counts as contact", async () => {
    await recordLeadContact({ leadId: LEAD, userId: "u1", channel: "call", direction: "incoming", durationSec: 45, externalRef: "c3" });
    expect(waInsert).toHaveBeenCalledWith(expect.objectContaining({ content: "Incoming call — Answered (45s)" }));
    expect(markLeadContacted).toHaveBeenCalled();
  });
});
