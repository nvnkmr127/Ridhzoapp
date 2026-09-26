import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ user: { id: "11111111-1111-1111-1111-111111111111", email: "me@ridhzo.com" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/domains/platform/opsAlertService", () => ({ OpsAlertService: { dispatchAlert: vi.fn().mockResolvedValue(true) } }));
vi.mock("@/domains/platform/service", () => ({
  PlatformService: {
    countSuperAdmins: vi.fn(),
    setSuperAdmin: vi.fn().mockResolvedValue({ id: "u", email: "new@x.com", organizationId: "22222222-2222-2222-2222-222222222222" }),
  },
}));

import { toggleSuperAdminAction } from "./platform";
import { PlatformService } from "@/domains/platform/service";
import { AuditService } from "@/domains/audit/service";
import { OpsAlertService } from "@/domains/platform/opsAlertService";

const target = "33333333-3333-3333-3333-333333333333";
beforeEach(() => vi.clearAllMocks());

describe("toggleSuperAdminAction", () => {
  it("audits a grant (platform + tenant trail) and alerts ops", async () => {
    const res = await toggleSuperAdminAction(target, true);
    expect(res.ok).toBe(true);
    const actions = vi.mocked(AuditService.log).mock.calls.map((c) => [c[0].action, c[0].userId]);
    expect(actions).toEqual([
      ["platform.super_admin_grant", "11111111-1111-1111-1111-111111111111"],
      ["platform.super_admin_grant", "11111111-1111-1111-1111-111111111111"],
    ]);
    expect(OpsAlertService.dispatchAlert).toHaveBeenCalled();
  });

  it("refuses to remove the last super-admin", async () => {
    vi.mocked(PlatformService.countSuperAdmins).mockResolvedValue(1);
    const res = await toggleSuperAdminAction(target, false);
    expect(res.ok).toBe(false);
    expect(PlatformService.setSuperAdmin).not.toHaveBeenCalled();
  });

  it("rejects a malformed user id", async () => {
    expect((await toggleSuperAdminAction("not-a-uuid", true)).ok).toBe(false);
  });
});
