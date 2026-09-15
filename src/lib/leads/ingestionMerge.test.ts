import { describe, it, expect } from "vitest";
import { mergeCustomData } from "./ingestion";

describe("mergeCustomData (dedup / re-ingestion)", () => {
  it("preserves first-touch attribution while updating other fields", () => {
    const existing = {
      leadSource: "Facebook Ads (Spring Campaign)",
      facebook_lead_id: "lg_first",
      meta_campaign_name: "Spring Campaign",
      preferred_time: "Morning",
    };
    const incoming = {
      leadSource: "Facebook Ads (Summer Campaign)",
      facebook_lead_id: "lg_second",
      meta_campaign_name: "Summer Campaign",
      preferred_time: "Evening", // non-attribution field: newest wins
      budget: "50000", // brand-new field: added
    };

    const merged = mergeCustomData(existing, incoming, "src-1");

    // First-touch attribution is kept from the original submission.
    expect(merged.leadSource).toBe("Facebook Ads (Spring Campaign)");
    expect(merged.facebook_lead_id).toBe("lg_first");
    expect(merged.meta_campaign_name).toBe("Spring Campaign");
    // Ordinary fields update to the latest values.
    expect(merged.preferred_time).toBe("Evening");
    expect(merged.budget).toBe("50000");
    expect(merged._lastIngestionSource).toBe("src-1");
  });

  it("takes incoming attribution when the existing lead had none", () => {
    const merged = mergeCustomData({ note: "manual" }, { meta_campaign_name: "New", leadSource: "Facebook Lead Ads" }, "src-2");
    expect(merged.meta_campaign_name).toBe("New");
    expect(merged.leadSource).toBe("Facebook Lead Ads");
    expect(merged.note).toBe("manual");
  });

  it("tolerates missing incoming customData", () => {
    const merged = mergeCustomData({ a: 1 }, undefined, "src-3");
    expect(merged).toEqual({ a: 1, _lastIngestionSource: "src-3" });
  });
});
