import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanService } from "./planService";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

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

  it("allows the 2nd sequence on free", async () => {
    queueResults([[{ plan: "free" }], [{ n: 1 }]]);
    await expect(PlanService.assertCanAdd("org", "sequences")).resolves.toBeUndefined();
  });

  it("never counts on paid plans", async () => {
    queueResults([[{ plan: "starter", planStatus: "active" }]]);
    await expect(PlanService.assertCanAdd("org", "automations")).resolves.toBeUndefined();
  });

  it("AI is off on free and on for paid", async () => {
    queueResults([[{ plan: "free" }]]);
    expect(await PlanService.aiAllowed("org")).toBe(false);
    queueResults([[{ plan: "starter", planStatus: "active" }]]);
    expect(await PlanService.aiAllowed("org")).toBe(true);
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
