import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanService, signupTrial } from "./planService";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));

// db.select is called: (1) plan lookup, (2) user count, (3) invitation count.
function queueResults(results: any[][]) {
  let i = 0;
  (db.select as any).mockImplementation(() => ({
    from: () => ({
      where: () => {
        const r = results[i++];
        return { limit: () => Promise.resolve(r), then: (res: any) => Promise.resolve(r).then(res) };
      },
    }),
  }));
}

describe("PlanService.assertCanAddSeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when active users + open invites reach the plan's seat limit", async () => {
    queueResults([[{ plan: "free" }], [{ n: 1 }], [{ n: 0 }]]); // free=1 seat, 1 user = full
    await expect(PlanService.assertCanAddSeat("org")).rejects.toThrow(/1 seats/);
  });

  it("allows a seat when under the limit", async () => {
    queueResults([[{ plan: "free" }], [{ n: 0 }], [{ n: 0 }]]);
    await expect(PlanService.assertCanAddSeat("org")).resolves.toBeUndefined();
  });

  it("an ended trial gets free limits even before the downgrade worker runs", async () => {
    const ended = new Date(Date.now() - 60_000);
    queueResults([[{ plan: "starter", planStatus: "active", trialEndsAt: ended }], [{ n: 1 }], [{ n: 0 }]]); // free = 1 seat, full
    await expect(PlanService.assertCanAddSeat("org")).rejects.toThrow(/1 seats/);
  });

  it("never blocks an unlimited plan", async () => {
    queueResults([[{ plan: "unlimited", planStatus: "active" }]]); // Infinity seats — returns before counting
    await expect(PlanService.assertCanAddSeat("org")).resolves.toBeUndefined();
  });

  it("reverts to free limits when planStatus is halted", async () => {
    queueResults([[{ plan: "starter", planStatus: "halted" }], [{ n: 1 }], [{ n: 0 }]]); // starter halted -> falls back to free (1 seat), 1 user = full
    await expect(PlanService.assertCanAddSeat("org")).rejects.toThrow(/1 seats/);
  });
});

describe("PlanService free-plan gates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks a 3rd automation on free, with a LIMIT-mapped message", async () => {
    queueResults([[{ plan: "free" }], [{ n: 2 }]]);
    await expect(PlanService.assertCanAdd("org", "automations")).rejects.toThrow(/Free plan allows 2 automations/);
  });

  it("blocks a 2nd lead source on free", async () => {
    queueResults([[{ plan: "free" }], [{ n: 1 }]]);
    await expect(PlanService.assertCanAdd("org", "sources")).rejects.toThrow(/1 lead sources/);
  });

  it("allows the first sequence on free", async () => {
    queueResults([[{ plan: "free" }], [{ n: 0 }]]);
    await expect(PlanService.assertCanAdd("org", "sequences")).resolves.toBeUndefined();
  });

  it("never counts on the Unlimited plan", async () => {
    queueResults([[{ plan: "unlimited", planStatus: "active" }]]);
    await expect(PlanService.assertCanAdd("org", "automations")).resolves.toBeUndefined();
  });

  it("background AI tagging is off on free and on for paid", async () => {
    queueResults([[{ plan: "free" }]]);
    expect(await PlanService.aiAutoTagAllowed("org")).toBe(false);
    queueResults([[{ plan: "starter", planStatus: "active" }]]);
    expect(await PlanService.aiAutoTagAllowed("org")).toBe(true);
  });

  it("starts new signups on a 14-day Starter trial", async () => {
    const { signupTrial } = await import("./planService");
    const t = signupTrial();
    expect(t.plan).toBe("starter");
    expect(Math.round((t.trialEndsAt.getTime() - Date.now()) / 86_400_000)).toBe(14);
  });

  it("counts every new Facebook Page being connected at once", async () => {
    queueResults([[{ plan: "free" }], [{ n: 0 }]]);
    await expect(PlanService.assertCanAdd("org", "sources", 2)).rejects.toThrow(/1 lead sources/);
  });
});

describe("PlanService.runnableIds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is uncapped on paid plans", async () => {
    queueResults([[{ plan: "unlimited", planStatus: "active" }]]);
    expect(await PlanService.runnableIds("org", "automations")).toBeNull();
  });

  it("keeps only the oldest two on free", async () => {
    let i = 0;
    const results: any[][] = [[{ plan: "free" }], [{ id: "a" }, { id: "b" }]];
    (db.select as any).mockImplementation(() => ({
      from: () => ({
        where: () => {
          const r = results[i++];
          return { limit: () => Promise.resolve(r), orderBy: () => ({ limit: () => Promise.resolve(r) }) };
        },
      }),
    }));
    const ids = await PlanService.runnableIds("org", "automations");
    expect([...ids!]).toEqual(["a", "b"]);
  });
});

describe("PlanService AI credits", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockUpdate(returned: any[]) {
    (db.update as any).mockImplementation(() => ({
      set: () => ({ where: () => ({ returning: () => Promise.resolve(returned) }) }),
    }));
  }

  it("spends a credit when the guarded update matches", async () => {
    queueResults([[{ plan: "free" }], [{ end: null }]]); // plan lookup, then the billing-cycle lookup
    mockUpdate([{ id: "org" }]);
    expect(await PlanService.consumeAiCredit("org")).toBe(true);
  });

  it("reports out of credits when the cap guard blocks the update", async () => {
    queueResults([[{ plan: "free" }], [{ end: null }]]);
    mockUpdate([]);
    expect(await PlanService.consumeAiCredit("org")).toBe(false);
  });

  it("counts last month's usage as zero", async () => {
    queueResults([[{ plan: "free" }], [{ used: 15, period: "1999-01" }]]);
    expect(await PlanService.aiCredits("org")).toEqual({ used: 0, max: 15 });
  });
});

describe("PlanService.assertCanAddLead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a single lead just under the limit and blocks it at the limit", async () => {
    queueResults([[{ plan: "free" }], [{ n: 299 }]]); // free = 300 leads
    await expect(PlanService.assertCanAddLead("org")).resolves.toBeUndefined();
    queueResults([[{ plan: "free" }], [{ n: 300 }]]);
    await expect(PlanService.assertCanAddLead("org")).rejects.toThrow(/300 leads/);
  });

  it("checks the whole batch: 299 + 50 doesn't fit a 300-lead plan", async () => {
    queueResults([[{ plan: "free" }], [{ n: 299 }]]);
    await expect(PlanService.assertCanAddLead("org", 50)).rejects.toThrow(/50 more won't fit/);
  });

  it("a DB error is not read as 'zero leads used'", async () => {
    let i = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => ({ where: () => (i++ === 0 ? { limit: () => Promise.resolve([{ plan: "free" }]), then: (r: any) => Promise.resolve([{ plan: "free" }]).then(r) } : Promise.reject(new Error("db down"))) }),
    }));
    await expect(PlanService.assertCanAddLead("org")).rejects.toThrow("db down");
  });
});

describe("PlanService.plan on a database error", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps the last known plan instead of silently demoting to free, and logs the failure", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResults([[{ plan: "unlimited", planStatus: "active", trialEndsAt: null }]]);
    expect(await PlanService.plan("org-keep")).toBe("unlimited");
    (db.select as any).mockImplementationOnce(() => { throw new Error("db down"); });
    expect(await PlanService.plan("org-keep")).toBe("unlimited");
    expect(err).toHaveBeenCalled();
    (db.select as any).mockImplementationOnce(() => { throw new Error("db down"); });
    expect(await PlanService.plan("org-never-seen")).toBe("free");
    err.mockRestore();
  });
});

describe("signupTrial", () => {
  it("starts the plan chosen on the pricing page; anything else is Starter", () => {
    expect(signupTrial("unlimited").plan).toBe("unlimited");
    expect(signupTrial("starter").plan).toBe("starter");
    expect(signupTrial("free").plan).toBe("starter");
    expect(signupTrial().plan).toBe("starter");
  });
});
