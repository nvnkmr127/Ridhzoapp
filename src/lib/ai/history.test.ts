import { describe, it, expect } from "vitest";
import { flattenTurn, capHistory } from "./history";

// Regression tests for two conversation-context bugs found in QA:
//  H1 — drafted message bodies were dropped from the history the model sees
//  M1 — a plain tail window silently dropped early constraints in long threads

describe("flattenTurn (H1: draft body reaches the model)", () => {
  it("folds proposal bodies into assistant content", () => {
    const body = "Hi Priya! Want a viewing this weekend?";
    const msg = flattenTurn("assistant", "Drafted a follow-up for your approval.", [
      { channel: "whatsapp", leadName: "Priya", body },
    ]);
    expect(msg.content).toContain(body); // the follow-up "make it shorter" can now see the draft
    expect(msg.content).toContain("Priya");
  });

  it("leaves plain turns untouched", () => {
    expect(flattenTurn("user", "make it shorter")).toEqual({ role: "user", content: "make it shorter" });
    expect(flattenTurn("assistant", "done", [])).toEqual({ role: "assistant", content: "done" });
  });
});

describe("capHistory (M1: pin the first turn)", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

  it("returns history unchanged when within the cap", () => {
    const h = mk(5);
    expect(capHistory(h, 20)).toBe(h);
  });

  it("keeps the first turn plus the most recent (max-1) when over the cap", () => {
    const h = mk(16);
    const capped = capHistory(h, 10);
    expect(capped).toHaveLength(10);
    expect(capped[0]).toEqual({ i: 0 }); // earliest constraint survives
    expect(capped[capped.length - 1]).toEqual({ i: 15 }); // newest turn survives
    expect(capped[1]).toEqual({ i: 7 }); // then a contiguous recent tail
  });

  it("degenerate caps don't throw", () => {
    expect(capHistory(mk(5), 1)).toEqual([{ i: 0 }]);
    expect(capHistory(mk(5), 0)).toEqual([]);
  });
});
