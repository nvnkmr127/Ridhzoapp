import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
vi.mock("next-auth/next", () => ({ getServerSession: () => mockGetSession() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Each db.select(...).from().where().limit() resolves to the next queued result.
let queue: unknown[][] = [];
const chain = () => ({ from: () => ({ where: () => ({ limit: async () => queue.shift() ?? [] }) }) });
vi.mock("@/db", () => ({ db: { select: vi.fn(() => chain()) } }));

const session = (roleId: string | null) => ({ user: { id: `u-${roleId}`, organizationId: "org-1", roleId } });

describe("role resolution", () => {
  beforeEach(() => { queue = []; vi.resetModules(); });

  it("a user with no role gets member access, never admin", async () => {
    const { hasPermission } = await import("./index");
    mockGetSession.mockResolvedValue(session(null));
    // 1) users.roleId lookup → still null, 2) system member role
    queue = [[{ roleId: null }], [{ name: "member", permissions: [], organizationId: null }]];
    expect(await hasPermission("leads.edit")).toBe(true);
    expect(await hasPermission("users.manage")).toBe(false);
  });

  it("ignores a tenant role that belongs to another org", async () => {
    const { hasPermission } = await import("./index");
    mockGetSession.mockResolvedValue(session("foreign-role"));
    queue = [[{ name: "Boss", permissions: ["*"], organizationId: "org-2" }]];
    expect(await hasPermission("settings.manage")).toBe(false);
  });
});

describe("roleAssignmentError", () => {
  beforeEach(() => { queue = []; vi.resetModules(); });

  it("stops a users.manage-only manager from granting admin", async () => {
    const { roleAssignmentError } = await import("./index");
    mockGetSession.mockResolvedValue(session("mgr"));
    queue = [
      [{ name: "admin", permissions: [], organizationId: null }], // target role (system admin)
      [{ name: "Manager", permissions: ["users.manage"], organizationId: "org-1" }], // caller's role
    ];
    expect(await roleAssignmentError("org-1", "admin-role")).toMatch(/more access than you have/);
  });

  it("lets them grant a role within their own permissions", async () => {
    const { roleAssignmentError } = await import("./index");
    mockGetSession.mockResolvedValue(session("mgr2"));
    queue = [
      [{ name: "Rep", permissions: ["leads.edit"], organizationId: "org-1" }],
      [{ name: "Manager", permissions: ["users.manage", "leads.edit"], organizationId: "org-1" }],
    ];
    expect(await roleAssignmentError("org-1", "rep-role")).toBeNull();
  });

  it("rejects a role id that isn't a system or own-org role", async () => {
    const { roleAssignmentError } = await import("./index");
    mockGetSession.mockResolvedValue(session("mgr3"));
    queue = [[]];
    expect(await roleAssignmentError("org-1", "other-org-role")).toMatch(/doesn't exist/);
  });
});
