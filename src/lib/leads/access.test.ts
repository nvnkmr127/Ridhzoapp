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

  // Bulk filtering runs in SQL (owner, or working on the lead via a meeting/follow-up); the rows
  // Postgres returns are exactly the ones kept.
  it("keeps only the ids the visibility query returns", async () => {
    rows.mockReturnValue([{ id: "a" }]);
    isAdmin.mockResolvedValue(false);
    await expect(filterAccessibleLeadIds(["a", "b"], ctx)).resolves.toEqual(["a"]);
  });

  it("lets someone assigned a follow-up on the lead act on it", async () => {
    rows.mockReturnValueOnce([{ ownerId: "colleague" }]).mockReturnValueOnce([{ id: "l1" }]); // lead, then: works on it
    isAdmin.mockResolvedValue(false);
    await expect(assertLeadAccess("l1", ctx)).resolves.toBeUndefined();
  });
});
