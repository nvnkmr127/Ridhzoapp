import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "./normalize";

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
