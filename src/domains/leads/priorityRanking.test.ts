import { describe, expect, it } from "vitest";
import { aiSignalFor, rankByPriority, type AiSignal } from "./priorityRanking";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-04T09:00:00Z");

function cached(next: { urgency: string; confidence: string; id?: string } | null, opts: { at?: string; dismissed?: string[] } = {}) {
  return {
    customData: {
      _aiRecap: {
        text: "Enquiry about pricing",
        at: opts.at ?? new Date(NOW - HOUR).toISOString(),
        plan: { fields: [], status: null, next: next ? { id: next.id ?? "n_1", urgency: next.urgency, confidence: next.confidence } : null },
        dismissed: opts.dismissed,
      },
    },
  };
}

const row = (id: string, ai: AiSignal, isEngaged = false, score: number | null = 50) => ({ id, ai, isEngaged, score });

describe("aiSignalFor", () => {
  it("reads a fresh, confident plan — and nothing else", () => {
    expect(aiSignalFor(cached({ urgency: "now", confidence: "high" }).customData, NOW, 3 * HOUR).signal).toBe("urgent");
    expect(aiSignalFor(cached({ urgency: "today", confidence: "high" }).customData, NOW, 3 * HOUR).signal).toBe("today");
    expect(aiSignalFor(cached({ urgency: "this_week", confidence: "medium" }).customData, NOW, 3 * HOUR).signal).toBe("later");
  });

  it("never floats up on an unsure opinion", () => {
    expect(aiSignalFor(cached({ urgency: "now", confidence: "low" }).customData, NOW, 3 * HOUR).signal).toBe("later");
  });

  it("ignores a plan the rep dismissed, one that's gone stale, and one that never existed", () => {
    const dismissed = cached({ urgency: "now", confidence: "high" }, { dismissed: ["n_1"] });
    const stale = cached({ urgency: "now", confidence: "high" }, { at: new Date(NOW - 5 * HOUR).toISOString() });
    expect(aiSignalFor(dismissed.customData, NOW, 3 * HOUR).signal).toBeNull();
    expect(aiSignalFor(stale.customData, NOW, 3 * HOUR).signal).toBeNull();
    expect(aiSignalFor({}, NOW, 3 * HOUR).signal).toBeNull();
    expect(aiSignalFor({ _aiRecap: { text: "x", at: "not a date", plan: { next: { id: "n", urgency: "now", confidence: "high" } } } }, NOW, 3 * HOUR).signal).toBeNull();
  });
});

describe("rankByPriority", () => {
  it("puts a lead the AI says is urgent above everything the rules flagged", () => {
    const sorted = rankByPriority([
      row("high-score", null, true, 95),
      row("urgent", "urgent", false, 10),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["urgent", "high-score"]);
  });

  it("orders by AI urgency first, then a content open, then score", () => {
    const sorted = rankByPriority([
      row("engaged", "today", true, 20),
      row("today-plain", "today", false, 90),
      row("urgent", "urgent", false, 5),
      row("engaged-null", null, true, 95),
      row("later", "later", true, 99),
      row("plain-low", null, false, 30),
    ]);
    // Any live AI opinion outranks the rule-only signal — even a "this week" one, because the panel
    // only ever contains leads the rules already called high priority.
    expect(sorted.map((r) => r.id)).toEqual(["urgent", "engaged", "today-plain", "later", "engaged-null", "plain-low"]);
  });

  it("falls back to the old comparator when no lead has a cached plan", () => {
    const sorted = rankByPriority([row("a", null, false, 40), row("b", null, true, 10), row("c", null, false, 80)]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("is stable and total, so the panel never reshuffles on equal leads", () => {
    const items = [row("z", null, false, 50), row("a", null, false, 50)];
    expect(rankByPriority(items).map((r) => r.id)).toEqual(["a", "z"]);
    expect(rankByPriority([...items].reverse()).map((r) => r.id)).toEqual(["a", "z"]);
    expect(items.map((r) => r.id)).toEqual(["z", "a"]); // sorts a copy; the input is untouched
  });
});