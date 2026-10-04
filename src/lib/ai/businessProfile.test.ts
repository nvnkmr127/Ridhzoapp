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

describe("pickKnowledge — relevance, not just overlap", () => {
  it("prefers the rare matching term over the common one", () => {
    // "course" appears in every chunk and so is worth almost nothing; "installment" appears once and
    // is the actual question. The old overlap count ranked these by raw hits and got it backwards.
    const docs = [
      { title: "General", content: "course course course course course course course course\n\nEverything else about courses." },
      { title: "Payments", content: "Can I pay in installment? Yes, 2 installment plans are available." },
    ];
    expect(pickKnowledge(docs, "do you offer an installment plan?", 1)).toContain("[Payments]");
  });

  it("counts a term once per chunk however often it repeats", () => {
    const docs = [
      { title: "Shouty", content: "refund refund refund refund refund refund refund refund refund\n\nrefund refund refund refund" },
      { title: "Refunds", content: "A refund is processed within 7 working days to the original card." },
    ];
    // Repetition must not let the shouting chunk outrank the one that actually answers the question.
    expect(pickKnowledge(docs, "how long does a refund take?", 1)).toContain("[Refunds]");
  });

  it("breaks ties towards the more recently updated doc", () => {
    // Identical content, different age — callers pass docs newest-first.
    const docs = [
      { title: "New", content: "Office is open 9 to 5 on weekdays." },
      { title: "Old", content: "Office is open 9 to 5 on weekdays." },
    ];
    expect(pickKnowledge(docs, "office timings", 1)).toContain("[New]");
  });

  it("still finds a match in a doc with no matching title", () => {
    const docs = [{ title: "FAQ", content: "Yes, we do home pickup across Vijayawada." }];
    expect(pickKnowledge(docs, "do you do home pickup?", 1)).toContain("home pickup");
  });
});
