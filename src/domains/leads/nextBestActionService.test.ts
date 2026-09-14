import { describe, expect, it } from "vitest";
import { NextBestActionService } from "./nextBestActionService";

describe("NextBestActionService", () => {
  it("should recommend welcome template for uncontacted new lead with phone", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "new",
      phone: "+1234567890",
      lastContactedAt: null,
    });
    expect(rec.action).toBe("send_template");
    expect(rec.priority).toBe("high");
  });

  it("should recommend rescheduling overdue follow-up", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "active",
      nextFollowUpAt: new Date(Date.now() - 3600000), // 1 hour ago
    });
    expect(rec.action).toBe("reschedule_followup");
    expect(rec.priority).toBe("high");
  });

  it("should recommend closing deal for high-scoring lead", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "active",
      score: 85,
      lastContactedAt: new Date(),
    });
    expect(rec.action).toBe("close_deal");
    expect(rec.priority).toBe("high");
  });

  it("should recommend re-engaging cold lead after 6 days of inactivity", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "active",
      score: 40,
      lastContactedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    });
    expect(rec.action).toBe("reengage_cold_lead");
    expect(rec.priority).toBe("medium");
  });

  it("never recommends chasing resolved leads, even with an overdue follow-up", () => {
    for (const status of ["won", "lost", "unqualified"]) {
      const rec = NextBestActionService.getRecommendation({
        status,
        score: 90,
        phone: "+1234567890",
        nextFollowUpAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // overdue
        lastContactedAt: null,
      });
      expect(rec.priority).toBe("low");
    }
  });

  it("prioritizes a recent content open over routine cadence", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "new", // would otherwise recommend welcome template
      phone: "+1234567890",
      lastContactedAt: null,
      recentContentOpen: { title: "Pricing brochure", count: 3 },
    });
    expect(rec.action).toBe("call_lead");
    expect(rec.priority).toBe("high");
    expect(rec.reason).toContain("Pricing brochure");
  });
});
