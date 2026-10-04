import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  candidates: [] as any[],
  activeUserIds: ["u1"] as string[],
  updates: [] as any[],
  /** Set false to simulate losing the conditional-UPDATE race to an overlapping scan. */
  claimSucceeds: true,
}));

vi.mock("@/db", () => ({
  db: {
    // `from(USERS)` is the owner-liveness lookup; anything else is the candidate scan.
    select: () => ({
      // `.innerJoin` is the candidate scan; a bare `.where` is the owner-liveness lookup.
      from: () => ({
        innerJoin: () => ({
          where: () => ({ orderBy: () => ({ limit: async () => h.candidates }) }),
        }),
        where: async () => h.activeUserIds.map((id) => ({ id })),
      }),
    }),
    update: () => ({
      set: (values: any) => {
        h.updates.push(values);
        const where = {
          returning: async () => (h.claimSucceeds ? [{ id: "lead" }] : []),
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
          catch: (fn: any) => Promise.resolve(undefined).catch(fn),
        };
        return { where: () => where };
      },
    }),
  },
}));

vi.mock("@/db/schema", () => {
  const USERS = Symbol("users");
  return {
    leads: { id: "l.id", organizationId: "l.org", ownerId: "l.owner", status: "l.status", updatedAt: "l.updatedAt", customData: "l.cd", aiUrgencyAlertedAt: "l.alertedAt", aiUrgencyActionId: "l.actionId" },
    organizations: { id: "o.id", suspendedAt: "o.suspendedAt" },
    users: { id: "u.id", isActive: "u.isActive", deletedAt: "u.deletedAt", __USERS: USERS },
  };
});

const notify = vi.fn();
vi.mock("@/domains/notifications/service", () => ({
  NotificationService: { create: (...a: any[]) => notify(...a) },
}));

vi.mock("../redis", () => ({ createRedis: vi.fn(), quietErrors: vi.fn() }));
vi.mock("bullmq", () => ({ Worker: vi.fn(), Queue: vi.fn() }));

import { processAiUrgencyAlerts, isAlertWorthy, scheduleAiUrgencyScan, AI_URGENCY_MAX_PER_ORG } from "./aiUrgencyAlertWorker";
import { Queue } from "bullmq";

const URGENT = {
  id: "n_call",
  kind: "call",
  title: "Call Ravi",
  reason: "He asked twice for pricing and nobody has ever contacted him.",
  evidence: [],
  urgency: "now",
  confidence: "high",
  source: "ai",
} as const;

/**
 * A lead the prewarm worker already wrote a plan for. "new" + never contacted + a phone on file is
 * the rule engine's `high` priority case (first-contact window), so the fixture has both opinions.
 */
function candidate(overrides: any = {}) {
  return {
    lead: {
      id: "l1",
      organizationId: "org1",
      ownerId: "u1",
      name: "Ravi",
      status: "new",
      phone: "+91 99999 11111",
      email: "ravi@example.com",
      score: 40,
      lastContactedAt: null,
      nextFollowUpAt: null,
      updatedAt: new Date(),
      customData: { _aiRecap: { text: "Asked for pricing", at: new Date().toISOString(), plan: { fields: [], status: null, next: URGENT } } },
      ...overrides,
    },
  };
}

describe("aiUrgencyAlertWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.candidates = [];
    h.activeUserIds = ["u1"];
    h.updates.length = 0;
    h.claimSucceeds = true;
  });

  it("alerts only when the AI is urgent and sure, and the rule engine independently agrees", () => {
    expect(isAlertWorthy({ urgency: "now", confidence: "high" }, "high")).toBe(true);
    expect(isAlertWorthy({ urgency: "now", confidence: "high" }, "medium")).toBe(false); // the AI alone isn't enough
    expect(isAlertWorthy({ urgency: "now", confidence: "medium" }, "high")).toBe(false); // it wasn't sure
    expect(isAlertWorthy({ urgency: "today", confidence: "high" }, "high")).toBe(false); // not now
    expect(isAlertWorthy(null, "high")).toBe(false);
  });

  it("sends the model's reason and records which action fired", async () => {
    h.candidates = [candidate()];

    const res = await processAiUrgencyAlerts(new Date());

    expect(res).toEqual({ alerted: 1, considered: 1 });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u1",
      type: "ai_urgency",
      leadId: "l1",
      body: URGENT.reason,
    }));
    expect(h.updates[0]).toMatchObject({ aiUrgencyActionId: "n_call" });
  });

  it("skips a dismissed action and a lead with no cached plan", async () => {
    h.candidates = [
      candidate({ customData: { _aiRecap: { text: "x", at: new Date().toISOString(), dismissed: ["n_call"], plan: { fields: [], status: null, next: URGENT } } } }),
      candidate({ id: "l2", customData: {} }),
    ];
    const res = await processAiUrgencyAlerts(new Date());
    expect(res.alerted).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips a lead whose owner is no longer active — nobody to tell", async () => {
    h.activeUserIds = []; // owner deactivated or deleted
    h.candidates = [candidate()];

    const res = await processAiUrgencyAlerts(new Date());

    expect(res.alerted).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("caps how many alerts one org can take in a single run", async () => {
    h.candidates = Array.from({ length: AI_URGENCY_MAX_PER_ORG + 5 }, (_, i) => candidate({ id: `l${i}` }));

    const res = await processAiUrgencyAlerts(new Date());

    expect(res.alerted).toBe(AI_URGENCY_MAX_PER_ORG);
    expect(notify).toHaveBeenCalledTimes(AI_URGENCY_MAX_PER_ORG);
  });

  it("hands the claim back when the send fails, so the alert isn't swallowed for a day", async () => {
    h.candidates = [candidate()];
    notify.mockRejectedValueOnce(new Error("push service down"));

    const res = await processAiUrgencyAlerts(new Date());

    expect(res.alerted).toBe(0);
    expect(h.updates).toHaveLength(2); // claim, then release
    expect(h.updates[1]).toMatchObject({ aiUrgencyAlertedAt: null, aiUrgencyActionId: null });
  });

  it("sends nothing when another scan won the claim", async () => {
    h.candidates = [candidate()];
    h.claimSucceeds = false; // overlapping scan already claimed it

    const res = await processAiUrgencyAlerts(new Date());

    expect(res.alerted).toBe(0);
    expect(res.considered).toBe(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("registers a 30-minute job scheduler", async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    (Queue as any).mockImplementation(function () {
      return { upsertJobScheduler };
    });

    await scheduleAiUrgencyScan();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "ai-urgency-scan",
      { every: 30 * 60 * 1000 },
      expect.objectContaining({ name: "scan" }),
    );
  });
});