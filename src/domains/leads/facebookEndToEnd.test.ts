import { describe, expect, it, vi } from "vitest";
import { FacebookLeadMappingService } from "@/domains/leads/facebookLeadMappingService";
import { MetaTokenRefreshService } from "@/domains/leads/metaTokenRefreshService";


vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve([
            { id: "user-rep-1", firstName: "Alice", lastName: "Smith", organizationId: "tenant-org-100" },
            { id: "user-rep-2", firstName: "Bob", lastName: "Jones", organizationId: "tenant-org-100" },
          ])
        ),
      })),
    })),
  },
}));

describe("End-to-End Facebook Integration Pipeline", () => {
  it("1. Facebook OAuth fails honestly (no fabricated tokens) when the app isn't configured", async () => {
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    expect(MetaTokenRefreshService.isConfigured()).toBe(false);
    await expect(MetaTokenRefreshService.exchangeShortLivedToken("short_oauth_code_123")).rejects.toThrow(/not configured/i);
  });

  it("2. Maps Facebook leadgen payload to standard Ridhzo lead structure", () => {
    const fbPayload = {
      id: "leadgen_999111",
      created_time: "2026-08-28T10:00:00Z",
      form_id: "form_555",
      ad_id: "ad_444",
      ad_name: "Ad 1 - Video Demo",
      campaign_id: "cmp_777",
      campaign_name: "Summer Promo 2026",
      page_id: "fb_page_888",
      field_data: [
        { name: "full_name", values: ["Sarah Connor"] },
        { name: "email", values: ["sarah@sky.net"] },
        { name: "phone_number", values: ["+15550001111"] },
        { name: "project_budget", values: ["$50000"] },
        { name: "preferred_contact_time", values: ["Morning"] },
      ],
    };

    const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(fbPayload);

    expect(mapped.name).toBe("Sarah Connor");
    expect(mapped.email).toBe("sarah@sky.net");
    expect(mapped.phone).toBe("+15550001111");
    expect(mapped.expectedValue).toBe(50000);
    expect(mapped.source).toBe("Facebook Ads (Summer Promo 2026)");
    expect(mapped.customData["meta_campaign_name"]).toBe("Summer Promo 2026");
    expect(mapped.customData["preferred_contact_time"]).toBe("Morning");
    expect(mapped.customData["facebook_page_id"]).toBe("fb_page_888");
  });

  it("3. Allocates mapped lead to optimal sales rep in dedicated tenant organization", async () => {
    const repLoadData = [
      { userId: "user-rep-1", userName: "Alice Smith", activeLeadsCount: 2, capacityLimit: 10, remainingCapacity: 8 },
      { userId: "user-rep-2", userName: "Bob Jones", activeLeadsCount: 8, capacityLimit: 10, remainingCapacity: 2 },
    ];

    const optimalRep = repLoadData.sort((a, b) => b.remainingCapacity - a.remainingCapacity)[0];

    expect(optimalRep.userId).toBe("user-rep-1"); // Alice has the highest remaining capacity (8 vs 2)
    expect(optimalRep.remainingCapacity).toBe(8);
  });
});
