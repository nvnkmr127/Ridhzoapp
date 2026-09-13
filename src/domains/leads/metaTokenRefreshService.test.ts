import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MetaTokenRefreshService } from "./metaTokenRefreshService";

describe("MetaTokenRefreshService", () => {
  const origId = process.env.FACEBOOK_APP_ID;
  const origSecret = process.env.FACEBOOK_APP_SECRET;

  afterEach(() => {
    process.env.FACEBOOK_APP_ID = origId;
    process.env.FACEBOOK_APP_SECRET = origSecret;
  });

  describe("when Facebook is not configured", () => {
    beforeEach(() => {
      delete process.env.FACEBOOK_APP_ID;
      delete process.env.FACEBOOK_APP_SECRET;
    });

    it("reports not configured", () => {
      expect(MetaTokenRefreshService.isConfigured()).toBe(false);
    });

    it("throws instead of fabricating tokens", async () => {
      await expect(MetaTokenRefreshService.exchangeShortLivedToken("x")).rejects.toThrow(/not configured/i);
      await expect(MetaTokenRefreshService.fetchPageAccessToken("t", "p")).rejects.toThrow(/not configured/i);
      await expect(MetaTokenRefreshService.exchangeCodeForToken("c", "https://app/cb")).rejects.toThrow(/not configured/i);
    });
  });

  it("treats the mock_app_id/secret fallbacks as unconfigured", () => {
    process.env.FACEBOOK_APP_ID = "mock_app_id";
    process.env.FACEBOOK_APP_SECRET = "mock_app_secret";
    expect(MetaTokenRefreshService.isConfigured()).toBe(false);
  });

  describe("fetchFormLeads pagination", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it("follows paging.next until exhausted and stops (no infinite loop)", async () => {
      const pages: Record<string, any> = {
        page1: { data: [{ id: "l1" }, { id: "l2" }], paging: { next: "https://graph.facebook.com/next?cursor=2" } },
        page2: { data: [{ id: "l3" }], paging: {} }, // no next → stop
      };
      let call = 0;
      globalThis.fetch = (async (url: string) => {
        const body = call === 0 ? pages.page1 : pages.page2;
        call++;
        return { ok: true, json: async () => body } as Response;
      }) as typeof fetch;

      const leads = await MetaTokenRefreshService.fetchFormLeads("form_1", "tok");
      expect(call).toBe(2);
      expect(leads.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    });

    it("respects maxTotal so a huge form can't run away", async () => {
      globalThis.fetch = (async () =>
        ({ ok: true, json: async () => ({ data: [{ id: "x" }, { id: "y" }], paging: { next: "https://graph.facebook.com/next" } }) } as Response)) as typeof fetch;

      const leads = await MetaTokenRefreshService.fetchFormLeads("form_1", "tok", 2, 3);
      expect(leads.length).toBe(3);
    });
  });

  describe("isAuthError", () => {
    it("flags dead-token errors (code 190 / OAuthException / message)", () => {
      expect(MetaTokenRefreshService.isAuthError(Object.assign(new Error("x"), { metaCode: 190 }))).toBe(true);
      expect(MetaTokenRefreshService.isAuthError(Object.assign(new Error("x"), { metaType: "OAuthException" }))).toBe(true);
      expect(MetaTokenRefreshService.isAuthError(new Error("Error validating access token: expired"))).toBe(true);
    });
    it("does not flag transient/other errors", () => {
      expect(MetaTokenRefreshService.isAuthError(new Error("Meta Graph API error (500)"))).toBe(false);
      expect(MetaTokenRefreshService.isAuthError(Object.assign(new Error("rate limit"), { metaCode: 4 }))).toBe(false);
    });
  });

  it("should correctly detect if a Meta OAuth access token is expiring within buffer threshold", () => {
    const expiringAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days remaining
    expect(MetaTokenRefreshService.isTokenExpiringSoon(expiringAt, 7)).toBe(true);

    const validAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days remaining
    expect(MetaTokenRefreshService.isTokenExpiringSoon(validAt, 7)).toBe(false);
  });
});
