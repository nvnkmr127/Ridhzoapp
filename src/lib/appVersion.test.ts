import { describe, expect, it } from "vitest";
import { isOlder } from "./appVersion";

describe("isOlder", () => {
  it("compares dotted versions numerically", () => {
    expect(isOlder("1.0.9", "1.0.10")).toBe(true);
    expect(isOlder("1.2", "1.2.0")).toBe(false);
    expect(isOlder("2.0.0", "1.9.9")).toBe(false);
  });
  it("no minimum means never older", () => {
    expect(isOlder("0.0.1", null)).toBe(false);
    expect(isOlder("0.0.1", undefined)).toBe(false);
  });
});
