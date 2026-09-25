import { describe, it, expect, vi } from "vitest";
const update = vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "f1" }, { id: "f2" }] }) }) }));
vi.mock("@/db", () => ({ db: { update: () => update() } }));
import { handOverFollowUps } from "./state";

describe("handOverFollowUps", () => {
  it("moves the previous owner's pending follow-ups to the new owner", async () => {
    expect(await handOverFollowUps(["l1"], "old", "new")).toBe(2);
    expect(update).toHaveBeenCalledOnce();
  });
  it("is a no-op when there was no previous owner or it didn't change", async () => {
    update.mockClear();
    expect(await handOverFollowUps(["l1"], null, "new")).toBe(0);
    expect(await handOverFollowUps(["l1"], "same", "same")).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
