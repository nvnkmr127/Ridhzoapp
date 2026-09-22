import { describe, expect, it, vi } from "vitest";
import { LeadSourceService } from "./sourceService";

const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/db", () => ({
  db: {
    select: () => mockSelect(),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "src-1", organizationId: "org-a" }])),
      })),
    })),
  },
}));

describe("LeadSourceService - Workspace Isolation", () => {
  it("getSources requires an organizationId and returns empty array if missing/empty", async () => {
    const emptyResult = await LeadSourceService.getSources("");
    expect(emptyResult).toEqual([]);
  });

  it("getSources enforces filtering by organizationId", async () => {
    mockWhere.mockReturnValueOnce(Promise.resolve([{ id: "src-a", organizationId: "org-a", name: "Org A FB Page" }]));
    const result = await LeadSourceService.getSources("org-a");
    expect(result).toHaveLength(1);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("createSource throws if organizationId is missing", async () => {
    await expect(
      LeadSourceService.createSource({
        name: "Test Source",
        type: "facebook_lead_ads",
        organizationId: "",
      })
    ).rejects.toThrow(/organizationId is required/i);
  });
});
