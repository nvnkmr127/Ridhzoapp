import { describe, expect, it } from "vitest";
import { t } from "./i18n";

describe("i18n", () => {
  it("translates known text and fills placeholders", () => {
    expect(t("hi", "New lead: {name}", { name: "Ravi" })).toBe("नई लीड: Ravi");
    expect(t("te", "Leads")).toBe("లీడ్స్");
  });

  it("falls back to English for unknown text or language", () => {
    expect(t("hi", "Something new")).toBe("Something new");
    expect(t("fr", "New lead: {name}", { name: "Ravi" })).toBe("New lead: Ravi");
    expect(t(null, "Leads")).toBe("Leads");
  });

  it("leaves free text with no placeholders untouched", () => {
    expect(t("en", "Price is {not a var}")).toBe("Price is {not a var}");
  });
});
