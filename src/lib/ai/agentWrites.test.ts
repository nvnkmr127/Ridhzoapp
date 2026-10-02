import { describe, it, expect } from "vitest";
import { MAX_AGENT_WRITES } from "./agent";

describe("agent write cap", () => {
  it("is small and finite (prompt-injection blast radius)", () => {
    expect(MAX_AGENT_WRITES).toBeGreaterThan(0);
    expect(MAX_AGENT_WRITES).toBeLessThanOrEqual(5);
  });
});
