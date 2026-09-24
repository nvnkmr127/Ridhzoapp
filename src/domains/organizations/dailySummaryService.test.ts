import { describe, expect, it } from "vitest";
import { isActionable, isDueToSend, renderSummaryHtml, summarySubject, type DailySummaryStats } from "./dailySummaryService";

const empty: DailySummaryStats = { overdueFollowUps: 0, meetingsNeedOutcome: 0, meetingsToday: 0, newLeads: 0, uncontactedLeads: 0, unassignedLeads: 0, byRep: [] };

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
});
