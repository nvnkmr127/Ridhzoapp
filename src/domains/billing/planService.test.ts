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
