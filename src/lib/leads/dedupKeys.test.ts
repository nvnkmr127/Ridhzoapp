import { describe, it, expect } from "vitest";
import { emailKey, nameKey, phoneKey, sameLead } from "./dedupKeys";

describe("duplicate matching rule", () => {
  it("treats every way of writing an Indian mobile as the same number", () => {
    const k = phoneKey("9876543210");
    for (const v of ["+91 98765 43210", "919876543210", "+919876543210", "098765-43210", "0091 98765 43210"]) {
      expect(phoneKey(v)).toBe(k);
    }
  });

  it("keeps short numbers exact and ignores ones too short to trust", () => {
    expect(phoneKey("2345 678")).toBe("2345678");
    expect(phoneKey("12345")).toBe("");
    expect(phoneKey(null)).toBe("");
    expect(sameLead({ phone: "2345678" }, { phone: "912345678" }).phone).toBe(false);
  });

  it("matches email ignoring case and spaces, and never matches blanks", () => {
    expect(emailKey("  Ravi@Gmail.COM ")).toBe("ravi@gmail.com");
    expect(sameLead({ email: "Ravi@gmail.com" }, { email: "ravi@gmail.com" })).toEqual({ email: true, phone: false });
    expect(sameLead({ email: "", phone: "" }, { email: "", phone: "" })).toEqual({ email: false, phone: false });
  });

  it("name suggestions need a full name", () => {
    expect(nameKey("  Ravi   KUMAR. ")).toBe("ravi kumar");
    expect(nameKey("Ravi")).toBe("");
  });
});
