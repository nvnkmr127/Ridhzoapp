import { describe, expect, it } from "vitest";
import { FacebookLeadMappingService, FacebookLeadDetails } from "./facebookLeadMappingService";

describe("FacebookLeadMappingService", () => {
  it("should verify Facebook Webhook subscribe challenge correctly", () => {
    const res = FacebookLeadMappingService.verifyFacebookWebhook(
      "subscribe",
      "secret_token_123",
      "challenge_code_999",
      "secret_token_123"
    );

    expect(res.verified).toBe(true);
    expect(res.challenge).toBe("challenge_code_999");

    const failedRes = FacebookLeadMappingService.verifyFacebookWebhook(
      "subscribe",
      "wrong_token",
      "challenge_code_999",
      "secret_token_123"
    );
    expect(failedRes.verified).toBe(false);
  });

  it("should map raw Facebook field_data to standard Ridhzo lead structure", () => {
    const rawFbLead: FacebookLeadDetails = {
      id: "leadgen_12345",
      created_time: "2026-08-28T10:00:00Z",
      form_id: "form_777",
      ad_id: "ad_888",
      page_id: "page_999",
      field_data: [
        { name: "full_name", values: ["Alice Smith"] },
        { name: "email", values: ["alice@example.com"] },
        { name: "phone_number", values: ["+15559876543"] },
        { name: "budget", values: ["$25000"] },
        { name: "what_is_your_preferred_time_to_call?", values: ["Afternoon"] },
      ],
    };

    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(rawFbLead);

    expect(mapped.name).toBe("Alice Smith");
    expect(mapped.email).toBe("alice@example.com");
    expect(mapped.phone).toBe("+15559876543");
    expect(mapped.expectedValue).toBe(25000);
    expect(mapped.source).toBe("Facebook Lead Ads");
    expect(mapped.facebookLeadgenId).toBe("leadgen_12345");
    expect(mapped.facebookFormId).toBe("form_777");
    expect(mapped.customData["what_is_your_preferred_time_to_call?"]).toBe("Afternoon");
    expect(mapped.customData["meta_ad_id"]).toBe("ad_888");
  });

  it("routes a form question to a custom field key when a mapping rule is provided", () => {
    const rawFbLead: FacebookLeadDetails = {
      id: "leadgen_1",
      created_time: "2026-08-28T10:00:00Z",
      form_id: "form_1",
      field_data: [
        { name: "full_name", values: ["Bob Roy"] },
        { name: "email", values: ["bob@example.com"] },
        { name: "what_is_your_preferred_time_to_call?", values: ["Afternoon"] },
      ],
    };

    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(rawFbLead, [
      { facebookFieldKey: "what_is_your_preferred_time_to_call?", targetField: "customData", customDataKey: "preferred_time" },
    ]);

    // The answer now lands under the org custom-field key, not the raw Facebook question name.
    expect(mapped.customData["preferred_time"]).toBe("Afternoon");
    expect(mapped.customData["what_is_your_preferred_time_to_call?"]).toBeUndefined();
    // Built-in name/email mapping still works (custom rules are additive, not a replacement).
    expect(mapped.name).toBe("Bob Roy");
    expect(mapped.email).toBe("bob@example.com");
  });

  it("should concatenate first_name and last_name when full_name is absent", () => {
    const rawFbLead: FacebookLeadDetails = {
      id: "leadgen_67890",
      created_time: "2026-08-28T10:00:00Z",
      form_id: "form_123",
      field_data: [
        { name: "first_name", values: ["Bob"] },
        { name: "last_name", values: ["Marley"] },
        { name: "email", values: ["bob@example.com"] },
      ],
    };

    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(rawFbLead);

    expect(mapped.name).toBe("Bob Marley");
    expect(mapped.email).toBe("bob@example.com");
  });

  it("should attribute source to campaign name and retain unique form questions", () => {
    const rawFbLead: FacebookLeadDetails = {
      id: "leadgen_camp_1",
      created_time: "2026-09-12T10:00:00Z",
      form_id: "form_summer_1",
      campaign_id: "camp_100",
      campaign_name: "Summer Promo 2026",
      field_data: [
        { name: "full_name", values: ["Charlie Brown"] },
        { name: "email", values: ["charlie@example.com"] },
        { name: "phone_number", values: ["+15551234567"] },
        { name: "property_type", values: ["3BHK Apartment"] },
        { name: "loan_needed", values: ["Yes"] },
      ],
    };

    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(rawFbLead);

    expect(mapped.name).toBe("Charlie Brown");
    expect(mapped.source).toBe("Facebook Ads (Summer Promo 2026)");
    expect(mapped.customData["meta_campaign_name"]).toBe("Summer Promo 2026");
    expect(mapped.customData["meta_campaign_id"]).toBe("camp_100");
    expect(mapped.customData["property_type"]).toBe("3BHK Apartment");
    expect(mapped.customData["loan_needed"]).toBe("Yes");
  });
});
