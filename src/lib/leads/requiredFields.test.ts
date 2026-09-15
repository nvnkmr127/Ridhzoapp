import { describe, it, expect } from "vitest";
import { findMissingRequiredFields } from "./requiredFields";

describe("findMissingRequiredFields", () => {
  it("reports a configured field that is absent", () => {
    expect(findMissingRequiredFields(["name", "phone"], { email: "a@b.com" })).toEqual(["phone"]);
  });

  it("passes when every required field has a value", () => {
    expect(findMissingRequiredFields(["name", "phone", "company"], { phone: "12345", company: "Acme" })).toEqual([]);
  });

  it("treats whitespace-only as missing", () => {
    expect(findMissingRequiredFields(["company"], { company: "   " })).toEqual(["company"]);
  });

  it("ignores 'name' (always enforced elsewhere) and unknown keys", () => {
    expect(findMissingRequiredFields(["name"], {})).toEqual([]);
  });

  it("defaults to no optional requirements when config is null", () => {
    expect(findMissingRequiredFields(null, {})).toEqual([]);
  });

  it("reports every missing required field", () => {
    expect(findMissingRequiredFields(["email", "phone", "company"], {})).toEqual(["email", "phone", "company"]);
  });
});
