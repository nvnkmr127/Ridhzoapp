import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockCookies = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: () => mockGetSession(),
}));

vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

describe("Read-only impersonation RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restricts super-admin to .view permissions under read-only impersonation", async () => {
    const { hasPermission, isImpersonatingReadOnly, requireOrg } = await import("./index");

    mockGetSession.mockResolvedValue({
      user: {
        id: "super_1",
        email: "admin@platform.com",
        isSuperAdmin: true,
        organizationId: "admin_org",
      },
    });

    const cookieMap = new Map<string, string>([
      ["impersonate_org", "tenant_xyz"],
      ["impersonate_readonly", "true"],
    ]);

    mockCookies.mockResolvedValue({
      get: (name: string) => (cookieMap.has(name) ? { value: cookieMap.get(name) } : undefined),
    });

    expect(await isImpersonatingReadOnly()).toBe(true);

    const orgContext = await requireOrg();
    expect(orgContext.organizationId).toBe("tenant_xyz");
    expect(orgContext.readOnly).toBe(true);

    expect(await hasPermission("audit.view")).toBe(true);
    expect(await hasPermission("leads.edit")).toBe(false);
    expect(await hasPermission("leads.delete")).toBe(false);
    expect(await hasPermission("settings.manage")).toBe(false);
  });

  it("grants full permissions to super-admin when read-only cookie is not set", async () => {
    const { hasPermission, isImpersonatingReadOnly, requireOrg } = await import("./index");

    mockGetSession.mockResolvedValue({
      user: {
        id: "super_1",
        email: "admin@platform.com",
        isSuperAdmin: true,
        organizationId: "admin_org",
      },
    });

    const cookieMap = new Map<string, string>([["impersonate_org", "tenant_xyz"]]);

    mockCookies.mockResolvedValue({
      get: (name: string) => (cookieMap.has(name) ? { value: cookieMap.get(name) } : undefined),
    });

    expect(await isImpersonatingReadOnly()).toBe(false);

    const orgContext = await requireOrg();
    expect(orgContext.organizationId).toBe("tenant_xyz");
    expect(orgContext.readOnly).toBe(false);

    expect(await hasPermission("audit.view")).toBe(true);
    expect(await hasPermission("leads.edit")).toBe(true);
    expect(await hasPermission("settings.manage")).toBe(true);
  });
});
