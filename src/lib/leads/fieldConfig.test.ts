import { describe, it, expect } from "vitest";
import {
  resolveLeadFieldConfig,
  getLeadFieldValue,
  findMissingMandatoryLeadFields,
  DEFAULT_LEAD_FIELD_CONFIG,
  type LeadFieldConfig,
} from "./fieldConfig";

describe("fieldConfig", () => {
  it("resolves default field config when raw is null/empty", () => {
    const config = resolveLeadFieldConfig(null);
    expect(config).toEqual(DEFAULT_LEAD_FIELD_CONFIG);
    expect(config.budget).toBe("optional");
    expect(config.company).toBe("optional");
  });

  it("safely merges partial raw configurations", () => {
    const raw = { budget: "mandatory", company: "hidden", unknownField: "xyz" };
    const config = resolveLeadFieldConfig(raw);
    expect(config.budget).toBe("mandatory");
    expect(config.company).toBe("hidden");
    expect(config.location).toBe("optional");
  });

  it("extracts field values from top-level or customData", () => {
    const lead1 = {
      company: "Acme Corp",
      customData: {
        budget: "50000",
        location: "Hyderabad",
        industry: "SaaS",
        company_size: "50-100",
        website_url: "https://acme.com",
      },
    };

    expect(getLeadFieldValue(lead1, "company")).toBe("Acme Corp");
    expect(getLeadFieldValue(lead1, "budget")).toBe("50000");
    expect(getLeadFieldValue(lead1, "location")).toBe("Hyderabad");
    expect(getLeadFieldValue(lead1, "industry")).toBe("SaaS");
    expect(getLeadFieldValue(lead1, "companySize")).toBe("50-100");
    expect(getLeadFieldValue(lead1, "websiteUrl")).toBe("https://acme.com");
  });

  it("detects missing mandatory fields independently per tenant config", () => {
    const tenantAConfig: LeadFieldConfig = {
      budget: "mandatory",
      company: "mandatory",
      location: "optional",
      industry: "hidden",
      companySize: "hidden",
      websiteUrl: "optional",
    };

    const tenantBConfig: LeadFieldConfig = {
      budget: "optional",
      company: "optional",
      location: "mandatory",
      industry: "mandatory",
      companySize: "optional",
      websiteUrl: "mandatory",
    };

    // Payload has only company
    const leadData = {
      name: "Alice",
      company: "Stark Industries",
      customData: {},
    };

    // For Tenant A: budget is missing (company is present)
    const missingA = findMissingMandatoryLeadFields(tenantAConfig, leadData);
    expect(missingA.map((m) => m.key)).toEqual(["budget"]);

    // For Tenant B: location, industry, websiteUrl are missing (company is optional)
    const missingB = findMissingMandatoryLeadFields(tenantBConfig, leadData);
    expect(missingB.map((m) => m.key)).toEqual(["location", "industry", "websiteUrl"]);
  });

  it("passes when all mandatory fields are provided", () => {
    const tenantAConfig: LeadFieldConfig = {
      budget: "mandatory",
      company: "mandatory",
      location: "optional",
      industry: "hidden",
      companySize: "hidden",
      websiteUrl: "optional",
    };

    const leadData = {
      name: "Bob",
      company: "Wayne Enterprises",
      customData: {
        budget: "1000000",
      },
    };

    const missing = findMissingMandatoryLeadFields(tenantAConfig, leadData);
    expect(missing).toEqual([]);
  });
});
