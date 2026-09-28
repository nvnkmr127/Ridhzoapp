import { describe, it, expect, vi } from "vitest";
import { UserService } from "./service";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/domains/follow-ups/state", () => ({ handOverFollowUps: vi.fn(async () => 0) }));

// Fake transaction: selects return the queued row sets in order; updates record (owner, #ids).
function fakeTx(selects: unknown[][]) {
  const updates: { ownerId: string | null }[] = [];
  const chain = (rows: unknown[]) => ({ from: () => ({ where: () => ({ orderBy: async () => rows, limit: async () => rows }) }) });
  const tx = {
    select: () => chain(selects.shift() ?? []),
    update: () => ({ set: (v: { ownerId: string | null }) => ({ where: async () => updates.push(v) }) }),
  };
  return { tx, updates };
}

const reassign = (tx: unknown, to: string | null) =>
  (UserService as unknown as { reassignLeads: (...a: unknown[]) => Promise<Record<string, number>> }).reassignLeads(tx, "org", "leaver", to);

describe("UserService.reassignLeads", () => {
  it("splits leads evenly across a team, round-robin", async () => {
    const leads = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}` }));
    const { tx, updates } = fakeTx([[{ id: "a" }, { id: "b" }], leads]);
    expect(await reassign(tx, "team:t1")).toEqual({ a: 3, b: 2 });
    expect(updates.map((u) => u.ownerId)).toEqual(["a", "b"]);
  });

  it("rejects a team with nobody else active", async () => {
    const { tx } = fakeTx([[]]);
    await expect(reassign(tx, "team:t1")).rejects.toThrow(/no other active members/);
  });

  it("still hands everything to one person or to no one", async () => {
    const leads = [{ id: "l1" }, { id: "l2" }];
    expect(await reassign(fakeTx([[{ id: "p" }], leads]).tx, "p")).toEqual({ p: 2 });
    expect(await reassign(fakeTx([leads]).tx, null)).toEqual({ "": 2 });
  });
});
