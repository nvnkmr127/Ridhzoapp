import { describe, it, expect } from "vitest";
import { applySourceFieldMappings } from "./sourceFieldMapping";

describe("applySourceFieldMappings", () => {
  it("routes mapped questions to lead fields and custom fields", () => {
    const out = applySourceFieldMappings(
      { WHAT_IS_YOUR_BUDGET: "$25,000", PREFERRED_TIME: "Afternoon", RANDOM_Q: "keep me" },
      [
        { facebookFieldKey: "what_is_your_budget", targetField: "expectedValue" },
        { facebookFieldKey: "preferred_time", targetField: "customData", customDataKey: "preferred_time" },
      ],
    );
    expect(out.expectedValue).toBe(25000);
    expect(out.customData.preferred_time).toBe("Afternoon");
    // Unmapped, non-empty answers fall through to customData under their raw key.
    expect(out.customData.RANDOM_Q).toBe("keep me");
  });

  it("skips empty values and matches keys case-insensitively", () => {
    const out = applySourceFieldMappings(
      { Email: "a@b.com", Phone: "" },
      [{ facebookFieldKey: "email", targetField: "email" }],
    );
    expect(out.email).toBe("a@b.com");
    expect(out.customData).toEqual({}); // empty phone dropped, email consumed by rule
  });

  it("returns raw customData when there are no rules", () => {
    const out = applySourceFieldMappings({ q1: "x", q2: "y" });
    expect(out.customData).toEqual({ q1: "x", q2: "y" });
    expect(out.name).toBeUndefined();
  });
});
