import { describe, it, expect, vi, beforeEach } from "vitest";

const limitSpy = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: limitSpy,
        })),
      })),
    })),
  },
}));

import { authOptions } from "./auth";

const jwtCallback = authOptions.callbacks!.jwt!;

describe("jwt callback — session liveness refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not hit the database again within the refresh interval", async () => {
    const token = { id: "u1", roleId: "role-1", organizationId: "org-1", isSuperAdmin: false, refreshedAt: Date.now() };
    const result = await jwtCallback({ token } as any);
    expect(limitSpy).not.toHaveBeenCalled();
    expect(result.roleId).toBe("role-1");
  });

  it("re-reads role/org/active status once the interval has elapsed", async () => {
    limitSpy.mockResolvedValue([{ roleId: "role-2", organizationId: "org-1", isSuperAdmin: false, isActive: true, deletedAt: null }]);
    const token = { id: "u1", roleId: "role-1", organizationId: "org-1", isSuperAdmin: false, refreshedAt: Date.now() - 120_000 };

    const result = await jwtCallback({ token } as any);

    expect(limitSpy).toHaveBeenCalled();
    expect(result.roleId).toBe("role-2"); // picked up the role change
  });

  // The concrete scenario A5 named: a user reassigned/demoted after sign-in should not keep
  // acting under their old role for the life of the token.
  it("clears roleId and organizationId once the user has been soft-deleted", async () => {
    limitSpy.mockResolvedValue([{ roleId: "role-1", organizationId: "org-1", isSuperAdmin: false, isActive: false, deletedAt: new Date() }]);
    const token = { id: "u1", roleId: "role-1", organizationId: "org-1", isSuperAdmin: false, refreshedAt: Date.now() - 120_000 };

    const result = await jwtCallback({ token } as any);

    expect(result.roleId).toBeNull();
    expect(result.organizationId).toBeNull();
  });

  it("clears the token when the user row is gone entirely", async () => {
    limitSpy.mockResolvedValue([]);
    const token = { id: "u1", roleId: "role-1", organizationId: "org-1", isSuperAdmin: false, refreshedAt: Date.now() - 120_000 };

    const result = await jwtCallback({ token } as any);

    expect(result.roleId).toBeNull();
    expect(result.organizationId).toBeNull();
  });

  it("stamps refreshedAt on initial sign-in without querying the database", async () => {
    const user = { id: "u1", roleId: "role-1", organizationId: "org-1", isSuperAdmin: false };
    const result = await jwtCallback({ token: {}, user } as any);
    expect(limitSpy).not.toHaveBeenCalled();
    expect(result.roleId).toBe("role-1");
    expect(typeof result.refreshedAt).toBe("number");
  });

  it("updates token.name on refresh from database user fields", async () => {
    limitSpy.mockResolvedValue([{
      id: "u1",
      firstName: "Pavan",
      lastName: null,
      email: "pavan@example.com",
      roleId: "role-1",
      organizationId: "org-1",
      isSuperAdmin: false,
      isActive: true,
      deletedAt: null,
      phone: null,
    }]);
    const token = { id: "u1", name: "pavan null", refreshedAt: Date.now() - 120_000 };
    const result = await jwtCallback({ token } as any);
    expect(result.name).toBe("Pavan");
  });
});

const sessionCallback = authOptions.callbacks!.session!;

describe("session callback — name sanitization", () => {
  it("strips literal 'null' from token.name if present in existing session", async () => {
    const token = { id: "u1", name: "pavan null", roleId: "r1", organizationId: "o1", isSuperAdmin: false };
    const session = { user: { name: "", email: "pavan@example.com" }, expires: "2099" };
    const result = await sessionCallback({ session: session as any, token: token as any });
    expect(result.user.name).toBe("pavan");
  });

  it("falls back to email when name evaluates to only 'null'", async () => {
    const token = { id: "u1", name: "null", roleId: "r1", organizationId: "o1", isSuperAdmin: false };
    const session = { user: { name: "", email: "pavan@example.com" }, expires: "2099" };
    const result = await sessionCallback({ session: session as any, token: token as any });
    expect(result.user.name).toBe("pavan@example.com");
  });
});
