import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { scoreCases } from "./score";
import { EVAL_CASES } from "./fixtures";

const baseline = JSON.parse(readFileSync(join(__dirname, "baseline.json"), "utf8"));

// The gate: a change to the prompt, the parser or the validator must not quietly make the AI worse
// at proposing things. Each metric is asserted individually so a regression names itself instead of
// hiding inside one blended score.
describe("AI lead-brief golden set", () => {
  const card = scoreCases(EVAL_CASES);

  it("scores at or above the recorded baseline", () => {
    const regressions: string[] = [];
    for (const key of ["usableAccuracy", "fieldPrecision", "fieldRecall", "rejectRate", "statusAccuracy", "nextKindAccuracy", "overall"] as const) {
      if (card[key] < baseline[key]) regressions.push(`${key}: ${card[key].toFixed(3)} < baseline ${baseline[key]}`);
    }
    expect(regressions, `\n${card.results.filter((r) => r.failures.length).map((r) => `${r.id}: ${r.failures.join("; ")}`).join("\n")}`).toEqual([]);
  });

  it("is strictly perfect — every golden case passes", () => {
    // The baseline is a high-water mark, not a target to relax toward. A new golden case may be
    // added freely; an existing one failing is a real bug in the validator, not a stale expectation.
    const failed = card.results.filter((r) => r.failures.length);
    expect(failed.map((r) => `${r.id}: ${r.failures.join("; ")}`)).toEqual([]);
  });

  it("covers the golden set with adversarial cases", () => {
    // Guards the harness itself: a golden set that quietly shrinks stops measuring anything.
    expect(card.cases).toBe(baseline.cases);
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(16);
    // Every case must declare what it defends against, or it is just a sample.
    expect(EVAL_CASES.every((c) => c.expect.why.length > 20)).toBe(true);
  });
});