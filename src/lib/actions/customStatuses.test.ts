import { describe, it, expect, vi, beforeEach } from "vitest";

// Gate proof: status-schema mutations must go through requirePermission("settings.manage"), not the
// bare requireOrg a plain member passes. We stub requirePermission to reject like an ungranted user
// and assert the mutation never reaches the service.

const { requirePermission, requireOrg, addOrUpdateStatus, deleteCustomStatus } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireOrg: vi.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1" }),
  addOrUpdateStatus: vi.fn().mockResolvedValue({ id: "s1" }),
  deleteCustomStatus: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rbac", () => ({ requirePermission, requireOrg }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domains/leads/customStatusSchemaService", () => ({
  CustomStatusSchemaService: { addOrUpdateStatus, deleteCustomStatus },
}));
vi.mock("@/domains/leads/leadStatusService", () => ({ LeadStatusService: {} }));
vi.mock("@/domains/leads/service", () => ({ LeadService: {} }));

import { addOrUpdateStatusAction, deleteCustomStatusAction } from "./customStatuses";

describe("custom status actions are gated by settings.manage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("addOrUpdateStatusAction requires settings.manage and is blocked without it", async () => {
    requirePermission.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      addOrUpdateStatusAction({ key: "hot", label: "Hot", color: "#fff", category: "open" }),
    ).rejects.toThrow("Forbidden");
    expect(requirePermission).toHaveBeenCalledWith("settings.manage");
    expect(addOrUpdateStatus).not.toHaveBeenCalled();
  });

  it("deleteCustomStatusAction requires settings.manage and is blocked without it", async () => {
    requirePermission.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(deleteCustomStatusAction("hot")).rejects.toThrow("Forbidden");
    expect(requirePermission).toHaveBeenCalledWith("settings.manage");
    expect(deleteCustomStatus).not.toHaveBeenCalled();
  });

  it("permits the mutation when settings.manage is granted", async () => {
    requirePermission.mockResolvedValue({ organizationId: "org-1", userId: "user-1" });
    const res = await addOrUpdateStatusAction({ key: "hot", label: "Hot", color: "#fff", category: "open" });
    expect(res.ok).toBe(true);
    expect(addOrUpdateStatus).toHaveBeenCalledOnce();
  });
});
