import { describe, expect, it } from "vitest";
import { ScoringService } from "./scoringService";

const DAY = 24 * 60 * 60 * 1000;

describe("ScoringService", () => {
  it("scores a won lead who replied and is in touch at the top", () => {
    const score = ScoringService.calculateScore({
      status: "won",
      phone: "+1234567890",
      email: "alex@example.com",
      lastContactedAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + DAY),
      hasInboundMsg: true,
    });
    expect(score).toBe(100);
  });

  it("gives a bare new lead only its open-lead base", () => {
    expect(ScoringService.calculateScore({ status: "new" })).toBe(10);
  });

  it("does not reward stale contact", () => {
    const score = ScoringService.calculateScore({
      status: "active",
      phone: "+1234567890",
      lastContactedAt: new Date(Date.now() - 30 * DAY),
    });
    expect(score).toBe(25); // 20 (in progress) + 5 (phone)
  });

  it("clamps at 0 for closed-lost leads", () => {
    expect(ScoringService.calculateScore({ status: "unqualified" })).toBe(0);
  });

  it("weights the lead's own actions above profile completeness", () => {
    const engaged = ScoringService.calculateScore({ status: "active", hasInboundMsg: true, answeredCalls: 1, contentViews: 2 });
    const complete = ScoringService.calculateScore({ status: "active", phone: "+1", email: "a@b.c", company: "Acme" });
    expect(engaged).toBeGreaterThan(complete);
  });

  it("scores custom statuses by their category", () => {
    expect(ScoringService.calculateScore({ status: "site_visit_done", statusCategory: "in_progress" })).toBe(20);
    expect(ScoringService.calculateScore({ status: "closed_deal", statusCategory: "won" })).toBe(50);
  });

  it("penalises a run of unanswered calls instead of rewarding the attempts", () => {
    const bd = ScoringService.breakdown({ status: "active", phone: "+1", unansweredStreak: 3 });
    expect(bd.factors.find((f) => f.points < 0)?.label).toMatch(/3 calls unanswered/);
    expect(bd.score).toBe(15); // 20 + 5 - 10
  });

  it("breakdown factors sum to the score and explain it", () => {
    const bd = ScoringService.breakdown({ status: "active", phone: "+1234567890", lastContactedAt: new Date(Date.now() - 30 * DAY) });
    expect(bd.factors.reduce((s, f) => s + f.points, 0)).toBe(bd.score);
    expect(bd.factors.map((f) => f.label)).toEqual(["In progress", "Has phone"]);
  });

  it("breakdown omits zero-point factors", () => {
    expect(ScoringService.breakdown({ status: "unqualified" }).factors).toEqual([]);
  });

  it("reads answered calls and the current unanswered streak from call activities", () => {
    const newestFirst = [
      { type: "call", content: "Called — No answer" },
      { type: "call", content: "Called — Busy / call back later" },
      { type: "note", content: "x" },
      { type: "call", content: "Called — Answered" },
      { type: "call", content: "Called — No answer" },
    ];
    expect(ScoringService.callStats(newestFirst)).toEqual({ answeredCalls: 1, unansweredStreak: 2 });
  });
});
