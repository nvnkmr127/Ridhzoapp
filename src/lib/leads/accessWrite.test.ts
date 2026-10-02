import { describe, it, expect, vi, beforeEach } from "vitest";

// H1/C2: write paths need leads.edit, not just "this is my lead".
const hasPermission = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rbac", () => ({
  assertWritable: async () => ({ userId: "u1", organizationId: "o1" }),
  hasPermission: (k: string) => hasPermission(k),
}));
vi.mock("@/domains/leads/service", () => ({ LeadService: { getLead: vi.fn(async () => ({ id: "l1", ownerId: "u1" })) } }));
vi.mock("@/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: async () => [{ ownerId: "u1" }] })) })) })) },
}));

import { assertLeadWrite, filterWritableLeadIds, getActionableLead } from "./access";

describe("lead write gate", () => {
  beforeEach(() => hasPermission.mockReset());

  it("refuses a role without leads.edit", async () => {
    hasPermission.mockImplementation(async (k: string) => k !== "leads.edit");
    await expect(assertLeadWrite("l1", { userId: "u1", organizationId: "o1" })).rejects.toThrow("Forbidden");
    await expect(filterWritableLeadIds(["l1"], { userId: "u1", organizationId: "o1" })).rejects.toThrow("Forbidden");
    expect(await getActionableLead("l1")).toBeNull();
  });

  it("lets a read-style caller opt out of the write gate", async () => {
    hasPermission.mockImplementation(async (k: string) => k !== "leads.edit");
    expect(await getActionableLead("l1", { write: false })).toMatchObject({ userId: "u1" });
  });

  it("allows an editor on their own lead", async () => {
    hasPermission.mockResolvedValue(true);
    await expect(assertLeadWrite("l1", { userId: "u1", organizationId: "o1" })).resolves.toBeUndefined();
    expect(await getActionableLead("l1")).toMatchObject({ organizationId: "o1" });
  });
});
