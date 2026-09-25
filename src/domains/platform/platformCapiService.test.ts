import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetaCapiService } from "./capiService";
import { PlatformAttributionService } from "./attributionService";
import { PlatformConfigService } from "./configService";

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: "org_1", plan: "business", planStatus: "active", createdAt: new Date() },
        { id: "org_2", plan: "pro", planStatus: "active", createdAt: new Date() },
        { id: "org_3", plan: "free", planStatus: "active", createdAt: new Date() },
        { id: "org_4", plan: "free", planStatus: "active", createdAt: new Date() },
      ]),
    }),
  },
}));

describe("PlatformAttributionService", () => {
  let store: Record<string, any> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    vi.mocked(PlatformConfigService.get).mockImplementation(async (_key, fallback) => {
      return Object.keys(store).length > 0 ? store : fallback;
    });
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_key, val) => {
      store = val as Record<string, any>;
      return undefined;
    });
  });

  it("records and retrieves tenant attribution", async () => {
    const attr = {
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "meta_saas_scale",
      fbclid: "fb_12345",
      landingPage: "https://ridhzo.com/signup?utm_source=facebook",
    };

    const saved = await PlatformAttributionService.recordAttribution("org_1", attr);
    expect(saved.organizationId).toBe("org_1");
    expect(saved.utmCampaign).toBe("meta_saas_scale");
    expect(saved.createdAt).toBeDefined();

    const retrieved = await PlatformAttributionService.getAttribution("org_1");
    expect(retrieved?.fbclid).toBe("fb_12345");
  });

  it("aggregates campaign analytics with paid conversions and MRR", async () => {
    store = {
      org_1: {
        organizationId: "org_1",
        utmSource: "facebook",
        utmMedium: "cpc",
        utmCampaign: "meta_scale_q4",
      },
      org_2: {
        organizationId: "org_2",
        utmSource: "facebook",
        utmMedium: "cpc",
        utmCampaign: "meta_scale_q4",
      },
      org_3: {
        organizationId: "org_3",
        utmSource: "google",
        utmMedium: "search",
        utmCampaign: "crm_search_ads",
      },
      // org_4 has no attribution (direct/organic)
    };

    const analytics = await PlatformAttributionService.getCampaignAnalytics();

    expect(analytics.totalSignups).toBe(4);
    expect(analytics.attributedSignups).toBe(3);
    expect(analytics.directSignups).toBe(1);

    const metaCampaign = analytics.campaigns.find((c) => c.campaign === "meta_scale_q4");
    expect(metaCampaign).toBeDefined();
    expect(metaCampaign?.signups).toBe(2);
    // org_1 is business (449) and org_2 is pro (249) => 698 MRR
    expect(metaCampaign?.paidTenants).toBe(2);
    expect(metaCampaign?.conversionRate).toBe(100);
    expect(metaCampaign?.mrr).toBe(698);

    const direct = analytics.campaigns.find((c) => c.campaign === "Direct / Organic");
    expect(direct?.signups).toBe(1);
    expect(direct?.paidTenants).toBe(0);
  });
});

describe("MetaCapiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips dispatch when disabled or credentials missing", async () => {
    vi.mocked(PlatformConfigService.get).mockResolvedValue({
      pixelId: "",
      accessToken: "",
      enabled: false,
    });

    const res = await MetaCapiService.sendEvent({
      eventName: "CompleteRegistration",
      email: "founder@startup.com",
    });

    expect(res.ok).toBe(false);
    expect(res.message).toContain("not enabled");
  });

  it("hashes email and phone and calls Meta Graph API when enabled", async () => {
    vi.mocked(PlatformConfigService.get).mockResolvedValue({
      pixelId: "123456789",
      accessToken: "TEST_TOKEN_123",
      testEventCode: "TEST9999",
      enabled: true,
    });

    const globalFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1, fbtrace_id: "trace_123" }),
    });
    vi.stubGlobal("fetch", globalFetch);

    const res = await MetaCapiService.sendEvent({
      eventName: "CompleteRegistration",
      email: "Alice@Example.COM ",
      phone: "+919876543210",
      fbp: "fb.1.123",
      fbc: "fb.1.456",
      eventSourceUrl: "https://ridhzo.com/signup",
    });

    expect(res.ok).toBe(true);
    expect(res.httpCode).toBe(200);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = globalFetch.mock.calls[0];
    expect(callUrl).toContain("https://graph.facebook.com/v19.0/123456789/events");
    expect(callUrl).toContain("access_token=TEST_TOKEN_123");

    const body = JSON.parse(callInit.body);
    expect(body.test_event_code).toBe("TEST9999");
    expect(body.data[0].event_name).toBe("CompleteRegistration");
    // Email should be sha256 hashed and lowercased
    expect(body.data[0].user_data.em[0]).toBe(
      "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976"
    );
    expect(body.data[0].user_data.fbp).toBe("fb.1.123");
    expect(body.data[0].user_data.fbc).toBe("fb.1.456");

    vi.unstubAllGlobals();
  });
});
