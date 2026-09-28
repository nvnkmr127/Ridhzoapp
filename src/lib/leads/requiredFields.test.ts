import { describe, it, expect } from "vitest";
import { findMissingRequiredFields, leadEditFieldErrors } from "./requiredFields";

describe("findMissingRequiredFields", () => {
  it("reports a configured field that is absent", () => {
    expect(findMissingRequiredFields(["name", "phone"], { email: "a@b.com" })).toEqual(["phone"]);
  });

  it("passes when every required field has a value", () => {
    expect(findMissingRequiredFields(["name", "phone", "company"], { phone: "12345", company: "Acme" })).toEqual([]);
  });

  it("treats whitespace-only as missing", () => {
    expect(findMissingRequiredFields(["phone"], { phone: "   " })).toEqual(["phone"]);
  });

  it("never requires company (it isn't on the lead forms any more)", () => {
    expect(findMissingRequiredFields(["company"], {})).toEqual([]);
  });

  it("ignores 'name' (always enforced elsewhere) and unknown keys", () => {
    expect(findMissingRequiredFields(["name"], {})).toEqual([]);
  });

  it("defaults to no optional requirements when config is null", () => {
    expect(findMissingRequiredFields(null, {})).toEqual([]);
  });

  it("reports every missing required field", () => {
    expect(findMissingRequiredFields(["email", "phone", "company"], {})).toEqual(["email", "phone"]);
  });
});

describe("leadEditFieldErrors", () => {
  const org = { requiredLeadFields: ["name", "phone"], leadFieldConfig: { budget: "mandatory" } };
  // An older lead created before Budget became mandatory and before phone was required.
  const oldLead = { name: "Ravi", phone: null, customData: {} };

  it("lets an older lead be updated without filling newly required fields", () => {
    expect(leadEditFieldErrors(org, { ...oldLead, status: "contacted" }, ["status"])).toEqual({});
    expect(leadEditFieldErrors(org, { ...oldLead, name: "Ravi K" }, ["name"])).toEqual({});
  });

  it("blocks sending a required field empty", () => {
    expect(leadEditFieldErrors(org, oldLead, ["name", "phone", "budget"])).toEqual({
      phone: "Phone is required.",
      budget: "Budget is required.",
    });
  });

  it("passes once the sent fields are filled", () => {
    expect(leadEditFieldErrors(org, { ...oldLead, phone: "+919876543210", customData: { budget: "50,000" } }, ["phone", "budget"])).toEqual({});
  });
});
