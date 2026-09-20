import { describe, it, expect, vi, beforeEach } from "vitest";
import { CustomDomainService } from "./customDomainService";
import { FeatureFlagService } from "./featureFlags";
import { PlatformConfigService } from "./configService";

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ name: "Acme Corp" }]),
        }),
      }),
    }),
  },
}));

describe("CustomDomainService", () => {
  let store: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    store = [];
    vi.mocked(PlatformConfigService.get).mockImplementation(async (_key, fallback) => {
      return store.length > 0 ? store : fallback;
    });
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_key, val) => {
      store = val as any[];
      return undefined;
    });
  });

  it("registers a valid custom FQDN and normalizes scheme/path", async () => {
    const domain = await CustomDomainService.registerDomain("org_1", "https://crm.acmecorp.com/leads");

    expect(domain.domain).toBe("crm.acmecorp.com");
    expect(domain.orgId).toBe("org_1");
    expect(domain.orgName).toBe("Acme Corp");
    expect(domain.cnameTarget).toBe("cname.ridhzo.com");
    expect(domain.sslStatus).toBe("pending");
    expect(domain.verified).toBe(false);
    expect(store.length).toBe(1);
  });

  it("rejects invalid domains without dots", async () => {
    await expect(CustomDomainService.registerDomain("org_1", "localhost")).rejects.toThrow(
      /Enter a valid Fully Qualified Domain Name/
    );
  });

  it("prevents conflicting domain registrations across organizations", async () => {
    store = [
      {
        id: "dom_1",
        orgId: "org_alpha",
        orgName: "Alpha",
        domain: "app.client.com",
        cnameTarget: "cname.ridhzo.com",
        sslStatus: "active",
        verified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await expect(CustomDomainService.registerDomain("org_beta", "app.client.com")).rejects.toThrow(
      /already registered to another organization/
    );
  });

  it("verifies CNAME and provisions active SSL", async () => {
    store = [
      {
        id: "dom_1",
        orgId: "org_1",
        orgName: "Acme Corp",
        domain: "crm.acmecorp.com",
        cnameTarget: "cname.ridhzo.com",
        sslStatus: "pending",
        verified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const verified = await CustomDomainService.verifyDomain("dom_1");
    expect(verified?.verified).toBe(true);
    expect(verified?.sslStatus).toBe("active");
  });

  it("resolves verified custom domains to organization ID", async () => {
    store = [
      {
        id: "dom_1",
        orgId: "org_target",
        orgName: "Acme Corp",
        domain: "portal.acme.com",
        cnameTarget: "cname.ridhzo.com",
        sslStatus: "active",
        verified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const orgId = await CustomDomainService.resolveDomain("portal.acme.com");
    expect(orgId).toBe("org_target");

    const unknownOrg = await CustomDomainService.resolveDomain("nonexistent.com");
    expect(unknownOrg).toBeNull();
  });

  it("removes a custom domain mapping", async () => {
    store = [
      {
        id: "dom_remove",
        orgId: "org_1",
        orgName: "Acme",
        domain: "remove-me.com",
        cnameTarget: "cname.ridhzo.com",
        sslStatus: "pending",
        verified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const removed = await CustomDomainService.removeDomain("dom_remove");
    expect(removed).toBe(true);
    expect(store.length).toBe(0);
  });
});

describe("FeatureFlagService Tenant Overrides", () => {
  let flagStore: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    flagStore = [
      {
        key: "ai_assistant",
        name: "AI Copilot",
        description: "AI features",
        enabled: false, // Globally disabled
        plans: ["business"],
        allowedOrgIds: [],
      },
    ];
    vi.mocked(PlatformConfigService.get).mockImplementation(async (_key, fallback) => {
      return flagStore.length > 0 ? flagStore : fallback;
    });
    vi.mocked(PlatformConfigService.set).mockImplementation(async (_key, val) => {
      flagStore = val as any[];
      return undefined;
    });
  });

  it("grants tenant override and bypasses both global disabled state and plan tiers", async () => {
    // Before override: disabled globally and org is on 'free' plan
    const initialAllowed = await FeatureFlagService.isEnabled("ai_assistant", "org_vip", "free");
    expect(initialAllowed).toBe(false);

    // Grant tenant override
    await FeatureFlagService.setTenantOverride("ai_assistant", "org_vip", true);

    // Now vip tenant gets access despite global disabled switch and free plan
    const vipAllowed = await FeatureFlagService.isEnabled("ai_assistant", "org_vip", "free");
    expect(vipAllowed).toBe(true);

    // Other tenant without override remains blocked
    const otherAllowed = await FeatureFlagService.isEnabled("ai_assistant", "org_other", "free");
    expect(otherAllowed).toBe(false);

    // Revoke tenant override
    await FeatureFlagService.setTenantOverride("ai_assistant", "org_vip", false);
    const revokedAllowed = await FeatureFlagService.isEnabled("ai_assistant", "org_vip", "free");
    expect(revokedAllowed).toBe(false);
  });
});
