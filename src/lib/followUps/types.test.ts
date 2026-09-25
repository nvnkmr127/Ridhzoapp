import { describe, it, expect } from "vitest";
import { normalizeFollowUpType, followUpTypeLabel, CONTACT_TYPES } from "./types";

describe("follow-up types", () => {
  it("folds every legacy spelling into one key", () => {
    expect(["Call", "call", "PHONE"].map(normalizeFollowUpType)).toEqual(["call", "call", "call"]);
    expect(normalizeFollowUpType("WhatsApp")).toBe("whatsapp");
    expect(normalizeFollowUpType("Task")).toBe("task");
    expect(["follow_up", "followup", "Note", "Custom", "", null, "weird"].map(normalizeFollowUpType)).toEqual(Array(7).fill("followup"));
  });
  it("labels and contact types", () => {
    expect(followUpTypeLabel("follow_up")).toBe("Follow-up");
    expect(CONTACT_TYPES.has(normalizeFollowUpType("Task"))).toBe(false);
    expect(CONTACT_TYPES.has(normalizeFollowUpType("Call"))).toBe(true);
  });
});
