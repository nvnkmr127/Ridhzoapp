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

describe("NextBestActionService — real-use cases", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("treats custom statuses by category (closed custom status is not chased)", () => {
    const rec = NextBestActionService.getRecommendation({ status: "closed_paid", statusCategory: "won", lastContactedAt: null, phone: "+1" });
    expect(rec.label).toBe("Deal won");
  });

  it("gives an in-progress custom status real advice, not a generic default", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "site_visit_booked",
      statusCategory: "in_progress",
      score: 80,
      lastContactedAt: new Date(),
    });
    expect(rec.action).toBe("close_deal");
  });

  it("respects a follow-up the rep scheduled instead of nagging to re-engage", () => {
    const rec = NextBestActionService.getRecommendation({
      status: "active",
      lastContactedAt: new Date(Date.now() - 10 * DAY),
      nextFollowUpAt: new Date(Date.now() + 20 * DAY),
    });
    expect(rec.action).toBe("wait");
  });

  it("asks to call again after a missed call, then suggests WhatsApp after 3", () => {
    const base = { status: "new", phone: "+1", lastContactedAt: new Date() };
    expect(NextBestActionService.getRecommendation({ ...base, unansweredStreak: 1 })).toMatchObject({ action: "call_lead", priority: "high" });
    expect(NextBestActionService.getRecommendation({ ...base, unansweredStreak: 3 }).action).toBe("try_whatsapp");
  });

  it("asks for the outcome of an ended meeting instead of calling it an overdue follow-up", () => {
    const ended = { startAt: new Date(Date.now() - 2 * 60 * 60 * 1000), durationMinutes: 30, label: "Site visit" };
    const r = NextBestActionService.getRecommendation({ status: "active", phone: "+1", lastContactedAt: new Date(), nextFollowUpAt: ended.startAt, meeting: ended });
    expect(r).toMatchObject({ action: "log_meeting_outcome", priority: "high" });
  });

  it("suggests confirming a meeting in the next 24h, and waits when it's further out", () => {
    const base = { status: "active", phone: "+1", lastContactedAt: new Date() };
    const soon = { startAt: new Date(Date.now() + 3 * 60 * 60 * 1000), durationMinutes: 30, label: "Online meeting" };
    const later = { startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), durationMinutes: 30, label: "Online meeting" };
    expect(NextBestActionService.getRecommendation({ ...base, nextFollowUpAt: soon.startAt, meeting: soon }).action).toBe("confirm_meeting");
    expect(NextBestActionService.getRecommendation({ ...base, nextFollowUpAt: later.startAt, meeting: later }).action).toBe("wait");
  });
});
