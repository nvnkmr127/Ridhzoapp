export type FieldRequirement = "mandatory" | "optional" | "hidden";

export type LeadFieldKey =
  | "budget"
  | "company"
  | "location"
  | "industry"
  | "companySize"
  | "websiteUrl";

export interface LeadFieldDefinition {
  key: LeadFieldKey;
  label: string;
  type: "text" | "number" | "url";
  placeholder?: string;
}

export const CONFIGURABLE_LEAD_FIELDS: readonly LeadFieldDefinition[] = [
  { key: "budget", label: "Budget", type: "text", placeholder: "e.g. ₹50,000 or $5,000" },
  { key: "company", label: "Company", type: "text", placeholder: "Company name" },
  { key: "location", label: "Location", type: "text", placeholder: "City, area, or region" },
  { key: "industry", label: "Industry", type: "text", placeholder: "e.g. Real Estate, Retail" },
  { key: "companySize", label: "Company Size", type: "text", placeholder: "e.g. 1-10, 11-50, 50+" },
  { key: "websiteUrl", label: "Website URL", type: "url", placeholder: "https://example.com" },
] as const;

export type LeadFieldConfig = Record<LeadFieldKey, FieldRequirement>;

export const DEFAULT_LEAD_FIELD_CONFIG: LeadFieldConfig = {
  budget: "optional",
  company: "optional",
  location: "optional",
  industry: "optional",
  companySize: "optional",
  websiteUrl: "optional",
};

/**
 * Safely parse and normalize stored tenant field configuration.
 * Missing keys default to "optional".
 */
export function resolveLeadFieldConfig(raw: unknown): LeadFieldConfig {
  const result: LeadFieldConfig = { ...DEFAULT_LEAD_FIELD_CONFIG };
  if (!raw || typeof raw !== "object") return result;

  const input = raw as Record<string, unknown>;
  for (const field of CONFIGURABLE_LEAD_FIELDS) {
    const val = input[field.key];
    if (val === "mandatory" || val === "optional" || val === "hidden") {
      result[field.key] = val;
    }
  }
  return result;
}

/**
 * Extract a field's value from either top-level lead properties or customData.
 * Supports snake_case aliases commonly sent by webhook adapters or legacy payloads.
 */
export function getLeadFieldValue(
  data: Record<string, unknown> | null | undefined,
  key: LeadFieldKey,
): string {
  if (!data) return "";

  const custom = (data.customData as Record<string, unknown> | undefined) ?? {};

  switch (key) {
    case "company": {
      const v = data.company ?? custom.company;
      return v != null ? String(v).trim() : "";
    }
    case "budget": {
      const v = data.budget ?? custom.budget ?? (data.expectedValue != null ? String(data.expectedValue) : null);
      return v != null ? String(v).trim() : "";
    }
    case "location": {
      const v = data.location ?? custom.location ?? custom.city ?? custom.preferred_location;
      return v != null ? String(v).trim() : "";
    }
    case "industry": {
      const v = data.industry ?? custom.industry;
      return v != null ? String(v).trim() : "";
    }
    case "companySize": {
      const v = data.companySize ?? data.company_size ?? custom.companySize ?? custom.company_size;
      return v != null ? String(v).trim() : "";
    }
    case "websiteUrl": {
      const v = data.websiteUrl ?? data.website_url ?? custom.websiteUrl ?? custom.website_url ?? custom.website;
      return v != null ? String(v).trim() : "";
    }
    default:
      return "";
  }
}

/**
 * Validates lead data against a tenant's field configuration.
 * Returns a list of any mandatory fields that are missing or empty.
 */
export function findMissingMandatoryLeadFields(
  config: LeadFieldConfig | null | undefined,
  data: Record<string, unknown>,
): { key: LeadFieldKey; label: string }[] {
  const resolved = resolveLeadFieldConfig(config);
  const missing: { key: LeadFieldKey; label: string }[] = [];

  for (const field of CONFIGURABLE_LEAD_FIELDS) {
    if (resolved[field.key] === "mandatory") {
      const val = getLeadFieldValue(data, field.key);
      if (!val) {
        missing.push({ key: field.key, label: field.label });
      }
    }
  }

  return missing;
}
