import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user-1", organizationId: "org-1" } }),
}));

// Stash is exercised separately; here we just confirm the callback no longer leaks tokens to the client.
vi.mock("@/lib/leads/fbPendingStore", () => ({ setPendingPages: vi.fn().mockResolvedValue(undefined) }));

// Non-popup fallback writes sources directly; keep it off the real DB.
vi.mock("@/domains/leads/sourceService", () => ({
  LeadSourceService: { upsertFacebookPageSource: vi.fn().mockResolvedValue({ id: "src-1" }) },
}));

vi.mock("@/domains/leads/metaTokenRefreshService", () => {
  const configured = () => Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  return {
    MetaTokenRefreshService: {
      isConfigured: configured,
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        accessToken: "short_xyz",
        tokenType: "bearer",
        expiresInSeconds: 3600,
        expiresAt: new Date("2026-10-28T10:00:00Z"),
      }),
      exchangeShortLivedToken: vi.fn().mockResolvedValue({
        accessToken: "long_lived_token_xyz",
        tokenType: "bearer",
        expiresInSeconds: 5184000,
        expiresAt: new Date("2026-10-28T10:00:00Z"),
      }),
      fetchPageAccessToken: vi.fn().mockResolvedValue({
        pageId: "page_100200300",
        pageAccessToken: "page_access_token_abc",
      }),
      listPages: vi.fn().mockResolvedValue([
        {
          pageId: "page_100200300",
          name: "Acme Corp",
          pageAccessToken: "page_access_token_abc",
        },
      ]),
    },
  };
});

describe("Meta OAuth Callback Endpoint", () => {
  const origId = process.env.FACEBOOK_APP_ID;
  const origSecret = process.env.FACEBOOK_APP_SECRET;
  afterEach(() => {
    process.env.FACEBOOK_APP_ID = origId;
    process.env.FACEBOOK_APP_SECRET = origSecret;
  });

  it("should redirect with error if OAuth consent is denied", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/facebook/callback?error=access_denied&error_reason=user_denied");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/settings/integrations?error=oauth_denied");
  });

  it("should redirect with facebook_not_configured when app credentials are absent (no fake connection)", async () => {
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    const req = new NextRequest("http://localhost:3000/api/auth/facebook/callback?code=auth_code_123&state=org-999");
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("error=facebook_not_configured");
  });

  it("should process a valid code and redirect with success when configured (non-popup)", async () => {
    process.env.FACEBOOK_APP_ID = "real_app_id";
    process.env.FACEBOOK_APP_SECRET = "real_app_secret";
    const req = new NextRequest("http://localhost:3000/api/auth/facebook/callback?code=auth_code_123&state=org-999&pageId=page_100200300");
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("/settings/integrations?status=facebook_connected");
    expect(res.headers.get("location")).toContain("pageId=page_100200300");
  });

  it("should return HTML postMessage with pages_ready in popup mode (matching CSRF nonce)", async () => {
    process.env.FACEBOOK_APP_ID = "real_app_id";
    process.env.FACEBOOK_APP_SECRET = "real_app_secret";
    const req = new NextRequest("http://localhost:3000/api/auth/facebook/callback?code=auth_code_123&state=popup_n0nce", {
      headers: { cookie: "fb_oauth_state=n0nce" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("pages_ready");
    expect(html).toContain("page_100200300");
    expect(html).toContain("Acme Corp");
    // Page access token must NOT be sent to the browser anymore.
    expect(html).not.toContain("page_access_token_abc");
  });

  it("should reject popup callback when the CSRF nonce cookie is missing/mismatched", async () => {
    process.env.FACEBOOK_APP_ID = "real_app_id";
    process.env.FACEBOOK_APP_SECRET = "real_app_secret";
    const req = new NextRequest("http://localhost:3000/api/auth/facebook/callback?code=auth_code_123&state=popup_expected", {
      headers: { cookie: "fb_oauth_state=different" },
    });
    const res = await GET(req);
    const html = await res.text();
    expect(html).toContain("error");
    expect(html).not.toContain("pages_ready");
  });
});
