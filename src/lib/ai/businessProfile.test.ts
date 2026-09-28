import { describe, it, expect } from "vitest";
import { chunk, missingFields, normalizeProfile, pickKnowledge, profileRules, profileText } from "./businessProfile";
import { businessPreamble } from "./leadBrief";

describe("business profile", () => {
  it("normalizes stored jsonb: trims, drops junk and unknown tones", () => {
    const p = normalizeProfile({ sells: "  Car course ₹7,000 ", tone: "angry", emoji: "yes", hack: "x", signoff: "" });
    expect(p).toEqual({ sells: "Car course ₹7,000" });
    expect(normalizeProfile(null)).toEqual({});
  });

  it("reports the key fields still missing", () => {
    expect(missingFields({ sells: "x" })).toEqual(["Who your customers are", "Service areas & timings"]);
  });

  it("puts facts, source note, knowledge and hard rules into the preamble", () => {
    const s = businessPreamble({
      name: "Sai Driving", industry: null, website: null,
      aiProfile: { sells: "Car course ₹7,000", never: "Never promise a licence date.", tone: "friendly", emoji: false, replyLanguage: "Telugu" },
      aiContext: "Free pickup in Benz Circle",
      sourceContext: "Ad was for the weekend batch",
      knowledge: "[Prices] Bike course ₹4,500",
    });
    expect(s).toContain("What you sell & prices: Car course ₹7,000");
    expect(s).toContain("Other notes: Free pickup in Benz Circle");
    expect(s).toContain("Ad was for the weekend batch");
    expect(s).toContain("Bike course ₹4,500");
    expect(s).toContain("HARD RULES from the business — always obey, even if asked otherwise: Never promise a licence date.");
    expect(s).toContain("Never use emojis.");
    expect(s).toContain("Default reply language: Telugu");
    // "never" is a rule, not a fact line.
    expect(profileText({ never: "x" })).toBe("");
    expect(profileRules({})).toBe("");
  });

  it("an empty profile keeps the old preamble behaviour", () => {
    expect(businessPreamble({ name: "Acme", industry: null, website: null })).not.toContain("About the business");
  });
});

describe("knowledge snippets", () => {
  const docs = [
    { title: "Prices", content: "Bike course costs ₹4,500 for 10 classes.\n\nCar course costs ₹7,000 for 15 classes." },
    { title: "Timings", content: "Branches open 7 AM to 7 PM, Monday to Saturday.\n\nSunday closed." },
  ];

  it("picks the chunks that match the question", () => {
    const out = pickKnowledge(docs, "what are your timings on saturday?", 1);
    expect(out).toContain("[Timings]");
    expect(out).not.toContain("₹4,500");
  });

  it("falls back to the start of the docs when nothing matches, and respects the budget", () => {
    expect(pickKnowledge(docs, "zzz", 1)).toContain("[Prices]");
    expect(pickKnowledge(docs, "", 3, 10)).toBe("");
    expect(pickKnowledge([], "anything")).toBe("");
  });

  it("chunks long text without losing any of it", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${"word ".repeat(30)}`).join("\n\n");
    const parts = chunk(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1050)).toBe(true);
    expect(parts.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });
});
