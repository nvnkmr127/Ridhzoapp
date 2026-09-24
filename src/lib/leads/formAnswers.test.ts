import { describe, it, expect } from "vitest";
import { formAnswers, hasFormAnswers, humanizeKey } from "./formAnswers";

describe("formAnswers", () => {
  const cd = {
    what_is_your_budget: "80L",
    "preferred_location?": ["Whitefield", "HSR"],
    meta_campaign_name: "Diwali",
    utm_source: "fb",
    leadSource: "Facebook",
    _scoreFactors: { score: 10 },
    empty: "  ",
  };

  it("keeps only what the lead told us, labelled", () => {
    expect(formAnswers(cd, { what_is_your_budget: "Budget" })).toEqual([
      { key: "what_is_your_budget", label: "Budget", value: "80L" },
      { key: "preferred_location?", label: "Preferred location?", value: "Whitefield, HSR" },
    ]);
  });

  it("detects presence and humanizes raw keys", () => {
    expect(hasFormAnswers(cd)).toBe(true);
    expect(hasFormAnswers({ _x: 1, utm_source: "a" })).toBe(false);
    expect(humanizeKey("what_is_your_budget?")).toBe("What is your budget?");
  });
});
