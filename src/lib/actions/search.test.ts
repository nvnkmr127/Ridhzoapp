import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchUniversalAction } from "./search";

vi.mock("@/lib/rbac", () => ({
  requireOrg: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
  isSuperAdmin: vi.fn().mockResolvedValue(false),
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  leftJoin: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: mockDb,
}));

describe("searchUniversalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty arrays if query length is less than 2", async () => {
    const res = await searchUniversalAction("a");
    expect(res).toEqual({ leads: [], users: [] });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("searches both leads and team members scoped to org", async () => {
    const leadQueryChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: "l-1", name: "Acme Corp", email: "info@acme.com", phone: null, company: "Acme" },
      ]),
    };

    const userQueryChain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { id: "u-1", firstName: "John", lastName: "Doe", email: "john@example.com", roleName: "Admin" },
      ]),
    };

    mockDb.select
      .mockReturnValueOnce(leadQueryChain)
      .mockReturnValueOnce(userQueryChain);

    const res = await searchUniversalAction("john");

    expect(res.leads).toEqual([
      { id: "l-1", name: "Acme Corp", email: "info@acme.com", phone: null, company: "Acme" },
    ]);
    expect(res.users).toEqual([
      { id: "u-1", name: "John Doe", email: "john@example.com", roleName: "Admin" },
    ]);
  });
});
