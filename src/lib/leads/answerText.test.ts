import { describe, it, expect } from "vitest";
import { cleanFormAnswer, matchOption } from "./answerText";

describe("cleanFormAnswer", () => {
  it("turns Meta slugs into text", () => {
    expect(cleanFormAnswer("₹40-75_lakhs_")).toBe("₹40-75 lakhs");
    expect(cleanFormAnswer("residential_construction")).toBe("residential construction");
  });
  it("leaves emails, urls, sentences and plain values alone", () => {
    for (const v of ["jag_x@gmail.com", "https://a.com/x_y", "I like this_thing a lot", "yes"]) expect(cleanFormAnswer(v)).toBe(v);
  });
});

describe("matchOption", () => {
  it("matches ignoring case, spaces and underscores", () => {
    expect(matchOption(["Yes", "No"], "yes")).toBe("Yes");
    expect(matchOption(["₹40-75 lakhs"], "₹40-75_lakhs_")).toBe("₹40-75 lakhs");
    expect(matchOption(["Yes"], "maybe")).toBeUndefined();
  });
});
