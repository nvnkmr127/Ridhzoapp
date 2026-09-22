// Shared "form question → lead field" mapping used by webhook-style sources (Google today; reusable
// for any source that arrives as a flat key→value map). Facebook has its own field_data-array mapper
// but stores the SAME rule shape, so one config + one editor drives both.

export interface SourceFieldMappingRule {
  // The raw field key as the source delivers it (Google column_id, etc.). Matched case-insensitively.
  facebookFieldKey: string;
  targetField: "name" | "email" | "phone" | "expectedValue" | "customData";
  customDataKey?: string;
}

export interface AppliedFieldMapping {
  name?: string;
  email?: string;
  phone?: string;
  expectedValue?: number;
  customData: Record<string, string>;
}

/**
 * Applies a source's field-mapping rules to a flat map of raw answers. A rule routes a value to a
 * lead field (name/email/phone/expectedValue) or to a custom field (customData under `customDataKey`,
 * falling back to the raw key). Unmapped, non-empty answers land in customData under their raw key,
 * so nothing is lost. Pure — unit tested.
 */
export function applySourceFieldMappings(
  fields: Record<string, string>,
  rules: SourceFieldMappingRule[] = [],
): AppliedFieldMapping {
  const out: AppliedFieldMapping = { customData: {} };
  for (const [key, rawVal] of Object.entries(fields)) {
    const val = (rawVal ?? "").toString().trim();
    if (!val) continue;
    const rule = rules.find((r) => r.facebookFieldKey.toLowerCase() === key.toLowerCase());
    if (!rule) {
      out.customData[key] = val;
      continue;
    }
    switch (rule.targetField) {
      case "name": if (!out.name) out.name = val; break;
      case "email": out.email = val; break;
      case "phone": out.phone = val; break;
      case "expectedValue": {
        const num = Number(val.replace(/[^0-9.]/g, ""));
        if (!isNaN(num) && num > 0) out.expectedValue = num;
        break;
      }
      case "customData": out.customData[rule.customDataKey || key] = val; break;
    }
  }
  return out;
}
