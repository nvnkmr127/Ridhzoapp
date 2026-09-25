import { describe, expect, it } from "vitest";
import { isActionable, isDueToSend, milestoneFor, personalLine, renderSummaryHtml, summarySubject, type DailySummaryStats } from "./dailySummaryService";

const empty: DailySummaryStats = { overdueFollowUps: 0, meetingsNeedOutcome: 0, meetingsToday: 0, newLeads: 0, uncontactedLeads: 0, unassignedLeads: 0, byRep: [], people: [] };

describe("daily summary", () => {
  it("sends once per org-local day, only in the 8–11 AM window", () => {
    const nineIst = new Date("2026-10-05T03:30:00Z"); // 09:00 in Kolkata
    expect(isDueToSend(nineIst, "Asia/Kolkata", null)).toBe("2026-10-05");
    expect(isDueToSend(nineIst, "Asia/Kolkata", "2026-10-05")).toBeNull();
    expect(isDueToSend(nineIst, "UTC", null)).toBeNull(); // 03:30 UTC — too early
  });

  it("skips a quiet day and escapes names in the email", () => {
    expect(isActionable(empty)).toBe(false);
    const html = renderSummaryHtml("Acme <Homes>", { ...empty, overdueFollowUps: 3, byRep: [{ name: "<b>Ravi</b>", overdue: 3, needOutcome: 0 }] });
    expect(html).toContain("Acme &lt;Homes&gt;");
    expect(html).toContain("&lt;b&gt;Ravi&lt;/b&gt;: 3 overdue follow-ups");
    expect(html).not.toContain("Meetings today");
  });

  it("names only non-zero counts in the subject", () => {
    expect(summarySubject("Acme", { ...empty, meetingsToday: 1, overdueFollowUps: 2 })).toBe("Today at Acme: 2 overdue follow-ups · 1 meeting today");
  });

  it("builds a personal morning line only when there's something to do", () => {
    expect(personalLine({ overdue: 0, dueToday: 0, newLeads: 0 })).toBeNull();
    expect(personalLine({ overdue: 1, dueToday: 3, newLeads: 2 })).toBe("Follow-ups due today: 3 · Overdue follow-ups: 1 · New leads since yesterday: 2");
    expect(personalLine({ overdue: 0, dueToday: 2, newLeads: 0 }, "hi")).toBe("आज के फॉलो-अप: 2");
  });

  it("sends the week-one recap on local day 7 and the trial warning the day before it ends", () => {
    const created = new Date("2026-10-01T05:00:00Z"); // Oct 1 in Kolkata
    expect(milestoneFor("2026-10-08", "Asia/Kolkata", created, null)).toBe("week_one");
    expect(milestoneFor("2026-10-07", "Asia/Kolkata", created, null)).toBeNull();
    const trialEnd = new Date("2026-10-15T05:00:00Z");
    expect(milestoneFor("2026-10-14", "Asia/Kolkata", created, trialEnd)).toBe("trial_ends_tomorrow");
  });
});
