import { describe, it, expect } from "vitest";
import { preCallBrief } from "./preCallBrief";

const now = new Date("2026-10-01T12:00:00Z");
const base = { activities: [], messages: [], missing: [], next: { title: "Call now", reason: "" }, now };

describe("preCallBrief", () => {
  it("says so when there has been no contact", () => {
    expect(preCallBrief(base).last).toMatch(/first call/);
  });

  it("picks the newest real touch across calls and WhatsApp, ignoring system activity", () => {
    const b = preCallBrief({
      ...base,
      activities: [
        { type: "status_change", content: "New → Contacted", createdAt: "2026-10-01T11:00:00Z" },
        { type: "call", content: "Called — Answered (3 min)", createdAt: "2026-09-29T12:00:00Z" },
      ],
      messages: [{ direction: "inbound", body: "Can I visit Saturday?", createdAt: "2026-09-30T12:00:00Z" }],
    });
    expect(b.last).toBe("WhatsApp from lead · 1d ago — Can I visit Saturday?");
  });

  it("lists missing fields (max 4), the latest note and the next step", () => {
    const b = preCallBrief({
      ...base,
      activities: [{ type: "note", content: "Wants 3BHK", createdAt: "2026-09-30T12:00:00Z" }],
      missing: ["Budget", "Location", "Timeline", "Type", "Extra"],
      next: { title: "Book site visit", reason: "asked for Saturday" },
    });
    expect(b.ask).toEqual(["Budget", "Location", "Timeline", "Type"]);
    expect(b.note).toBe("1d ago: Wants 3BHK");
    expect(b.next).toBe("Book site visit — asked for Saturday");
  });
});
