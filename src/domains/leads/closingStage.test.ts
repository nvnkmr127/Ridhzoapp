import { describe, it, expect, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { matchClosingStage } from "./service";

describe("matchClosingStage", () => {
  const stages = [{ name: "New Lead" }, { name: "Site Visit" }, { name: "Closed Won" }, { name: "Closed - Lost" }];
  it("finds the won and lost stages by name", () => {
    expect(matchClosingStage(stages, "won")?.name).toBe("Closed Won");
    expect(matchClosingStage(stages, "lost")?.name).toBe("Closed - Lost");
  });
  it("never invents a stage", () => {
    expect(matchClosingStage([{ name: "New" }, { name: "Negotiation" }], "won")).toBeNull();
  });
});
