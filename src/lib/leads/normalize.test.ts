import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone, dialCodeFor } from "./normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Sarah@Example.COM ")).toBe("sarah@example.com");
  });
  it("returns undefined for empty/nullish", () => {
    expect(normalizeEmail("")).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
    expect(normalizeEmail(undefined)).toBeUndefined();
  });
});

describe("normalizePhone", () => {
  it("strips formatting so variants match", () => {
    expect(normalizePhone("+91 98453-91384")).toBe("+919845391384");
    expect(normalizePhone("(555) 000-1111")).toBe("5550001111");
  });
  it("preserves a leading +", () => {
    expect(normalizePhone("+15550001111")).toBe("+15550001111");
  });
  it("returns undefined when there are no digits", () => {
    expect(normalizePhone("")).toBeUndefined();
    expect(normalizePhone("n/a")).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
  });
});

describe("normalizePhone with a workspace dial code", () => {
  it("adds the country code to national numbers", () => {
    expect(normalizePhone("98765 43210", "+91")).toBe("+919876543210");
    expect(normalizePhone("098765 43210", "+91")).toBe("+919876543210"); // trunk 0
    expect(normalizePhone("9123456789", "+91")).toBe("+919123456789"); // starts with 91 but is national
  });
  it("doesn't double an existing country code", () => {
    expect(normalizePhone("919876543210", "+91")).toBe("+919876543210");
    expect(normalizePhone("0091 98765 43210", "+91")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210", "+1")).toBe("+919876543210");
  });
  it("works for US numbers too", () => {
    expect(normalizePhone("(555) 000-1111", "+1")).toBe("+15550001111");
    expect(normalizePhone("1 555 000 1111", "+1")).toBe("+15550001111");
  });
  it("leaves numbers as typed when the country is unknown", () => {
    expect(normalizePhone("98765 43210", null)).toBe("9876543210");
  });
});

describe("dialCodeFor", () => {
  it("prefers country, then timezone, then currency", () => {
    expect(dialCodeFor({ country: "AE", timezone: "Asia/Kolkata" })).toBe("+971");
    expect(dialCodeFor({ timezone: "Asia/Kolkata" })).toBe("+91");
    expect(dialCodeFor({ timezone: "UTC", currency: "INR" })).toBe("+91");
    expect(dialCodeFor({ timezone: "UTC", currency: "USD" })).toBeNull();
  });
});
