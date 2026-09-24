import { describe, it, expect } from "vitest";
import { cleanLossReasons, DEFAULT_LOSS_REASONS } from "./lossReasons";

describe("loss reasons", () => {
  it("trims, dedupes and always keeps Other", () => {
    expect(cleanLossReasons(["  Budget ", "budget", "", "Went with builder X"])).toEqual(["Budget", "Went with builder X", "Other"]);
  });
  it("defaults are plain sales language and end with Other", () => {
    expect(DEFAULT_LOSS_REASONS.at(-1)).toBe("Other");
    expect(DEFAULT_LOSS_REASONS.join(" ")).not.toMatch(/Product Fit|Missing Features/);
  });
});
