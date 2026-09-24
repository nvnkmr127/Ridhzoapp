import { describe, expect, it } from "vitest";
import { googleCalendarLink, leadMessage } from "./format";

const m = {
  mode: "site_visit",
  title: "Site visit with Asha",
  startAt: new Date("2026-10-01T09:30:00Z"),
  durationMinutes: 60,
  locationName: "Green Acres, Plot 12",
  address: "Kokapet, Hyderabad",
  mapUrl: "https://maps.app.goo.gl/x",
  meetingUrl: null,
};

describe("meeting format", () => {
  it("builds a lead confirmation with place, map and local time", () => {
    const text = leadMessage("confirm", m, { leadName: "Asha Rao", orgName: "Acme Homes", repName: "Ravi", timeZone: "Asia/Kolkata" });
    expect(text).toContain("Hi Asha, your site visit with Acme Homes is confirmed.");
    expect(text).toContain("3:00"); // 09:30 UTC = 15:00 IST
    expect(text).toContain("Where: Green Acres, Plot 12, Kokapet, Hyderabad");
    expect(text).toContain("Map: https://maps.app.goo.gl/x");
    expect(text).toContain("With: Ravi");
  });

  it("shows the join link for online meetings", () => {
    const text = leadMessage("reminder", { ...m, mode: "online", meetingUrl: "https://meet.google.com/abc" }, { leadName: "Asha", orgName: "Acme" });
    expect(text).toContain("Join: https://meet.google.com/abc");
    expect(text).not.toContain("Where:");
  });

  it("encodes start/end in the Google Calendar link", () => {
    const url = new URL(googleCalendarLink(m));
    expect(url.searchParams.get("dates")).toBe("20261001T093000Z/20261001T103000Z");
    expect(url.searchParams.get("location")).toContain("Kokapet");
  });
});
