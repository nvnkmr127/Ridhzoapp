import { describe, it, expect } from "vitest";
import { FacebookLeadAdsAdapter } from "./FacebookLeadAdsAdapter";

// The adapter must produce the SAME customData shape as the inline webhook / worker / sync paths
// (all delegate to FacebookLeadMappingService), so a lead ingested through the generic-webhook
// route gets the meta_* attribution keys the lead UI reads — not the old divergent formId/adId shape.
describe("FacebookLeadAdsAdapter.normalize", () => {
  it("emits meta_* attribution + leadSource via the shared mapping service", async () => {
    const raw = {
      id: "leadgen_123",
      form_id: "form_1",
      ad_id: "ad_9",
      ad_name: "Video Demo",
      adset_id: "adset_5",
      adset_name: "Prospecting",
      campaign_id: "cmp_7",
      campaign_name: "Summer Promo",
      page_id: "page_1",
      field_data: [
        { name: "full_name", values: ["Sarah Connor"] },
        { name: "email", values: ["sarah@sky.net"] },
        { name: "phone_number", values: ["+15550001111"] },
      ],
    };

    const out = await new FacebookLeadAdsAdapter().normalize(raw, "src-1", undefined, undefined);

    expect(out.name).toBe("Sarah Connor");
    expect(out.email).toBe("sarah@sky.net");
    expect(out.phone).toBe("+15550001111");
    expect(out.externalId).toBe("leadgen_123");
    expect(out.sourceId).toBe("src-1");
    expect(out.customData.meta_campaign_name).toBe("Summer Promo");
    expect(out.customData.meta_ad_name).toBe("Video Demo");
    expect(out.customData.facebook_lead_id).toBe("leadgen_123");
    expect(out.customData.leadSource).toBe("Facebook Ads (Summer Promo)");
    // The old divergent keys must be gone.
    expect(out.customData.rawFacebookData).toBeUndefined();
    expect(out.customData.adId).toBeUndefined();
  });
});
