import { describe, it, expect, vi, beforeEach } from "vitest";

const rows = vi.fn();
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve(rows()), { limit: () => Promise.resolve(rows()) }) }) }) },
}));
const isAdmin = vi.fn();
vi.mock("@/lib/rbac", () => ({ hasPermission: () => isAdmin(), assertWritable: vi.fn() }));
vi.mock("@/domains/leads/service", () => ({ LeadService: { getLead: vi.fn() } }));

import { assertLeadAccess, filterAccessibleLeadIds } from "./access";

const ctx = { userId: "me", organizationId: "org" };

describe("lead access rule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a rep act on their own lead", async () => {
    rows.mockReturnValue([{ ownerId: "me" }]);
    isAdmin.mockResolvedValue(false);
    await expect(assertLeadAccess("l1", ctx)).resolves.toBeUndefined();
  });

  it("blocks a rep from a colleague's lead (reported as not found)", async () => {
    rows.mockReturnValueOnce([{ ownerId: "colleague" }]).mockReturnValueOnce([]); // lead, then: no meeting of theirs
    isAdmin.mockResolvedValue(false);
    await expect(assertLeadAccess("l1", ctx)).rejects.toThrow("Lead not found");
  });

  it("lets someone assigned to a meeting with the lead act on it", async () => {
    rows.mockReturnValueOnce([{ ownerId: "colleague" }]).mockReturnValueOnce([{ id: "m1" }]);
    isAdmin.mockResolvedValue(false);
    await expect(assertLeadAccess("l1", ctx)).resolves.toBeUndefined();
  });

  it("lets admins act on any lead in the workspace", async () => {
    rows.mockReturnValue([{ ownerId: "colleague" }]);
    isAdmin.mockResolvedValue(true);
    await expect(assertLeadAccess("l1", ctx)).resolves.toBeUndefined();
  });

  it("filters bulk selections down to the rep's own leads", async () => {
    rows.mockReturnValue([{ id: "a", ownerId: "me" }, { id: "b", ownerId: "colleague" }]);
    isAdmin.mockResolvedValue(false);
    await expect(filterAccessibleLeadIds(["a", "b"], ctx)).resolves.toEqual(["a"]);
  });
});
