import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rbac", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ user: { id: "11111111-1111-1111-1111-111111111111", email: "me@ridhzo.com" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const cookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ set: cookieSet, delete: vi.fn(), get: vi.fn() })) }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/domains/platform/opsAlertService", () => ({ OpsAlertService: { dispatchAlert: vi.fn().mockResolvedValue(true) } }));
vi.mock("@/domains/platform/service", () => ({
  PlatformService: {
    countSuperAdmins: vi.fn(),
    setSuperAdmin: vi.fn().mockResolvedValue({ id: "u", email: "new@x.com", organizationId: "22222222-2222-2222-2222-222222222222" }),
    setSuspended: vi.fn(),
    getOrg: vi.fn().mockResolvedValue({ id: "o", name: "Acme" }),
    hardDeleteTenant: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import { toggleSuperAdminAction, setOrgSuspendedAction, bulkSetOrgSuspendedAction, impersonateOrgAction, hardDeleteTenantAction } from "./platform";
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

const orgA = "44444444-4444-4444-4444-444444444444";
const orgB = "55555555-5555-5555-5555-555555555555";

describe("reason-gated actions", () => {
  it("suspend needs a reason and records it; reactivate doesn't", async () => {
    vi.mocked(PlatformService.setSuspended).mockResolvedValue({ id: orgA } as any);
    expect((await setOrgSuspendedAction(orgA, true)).ok).toBe(false);
    expect(PlatformService.setSuspended).not.toHaveBeenCalled();
    expect((await setOrgSuspendedAction(orgA, true, "chargeback abuse")).ok).toBe(true);
    expect(vi.mocked(AuditService.log).mock.calls[0][0].metadata).toMatchObject({ reason: "chargeback abuse" });
    expect((await setOrgSuspendedAction(orgA, false)).ok).toBe(true);
  });

  it("bulk suspend reports exactly which orgs changed", async () => {
    vi.mocked(PlatformService.setSuspended).mockImplementation(async (id: string) => (id === orgA ? ({ id } as any) : null));
    const res = await bulkSetOrgSuspendedAction([orgA, orgB], true, "fraud ring");
    expect(res).toMatchObject({ ok: true, data: { succeeded: [orgA], failed: [orgB] } });
    expect(AuditService.log).toHaveBeenCalledTimes(1);
  });

  it("write impersonation needs a reason and is capped at 1h; read-only is 4h", async () => {
    expect((await impersonateOrgAction(orgA, false)).ok).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
    expect((await impersonateOrgAction(orgA, false, "reproduce import bug")).ok).toBe(true);
    expect(cookieSet.mock.calls[0][2].maxAge).toBe(3600);
    cookieSet.mockClear();
    expect((await impersonateOrgAction(orgA, true)).ok).toBe(true);
    expect(cookieSet.mock.calls[0][2].maxAge).toBe(4 * 3600);
  });

  it("hard delete needs a reason and passes it to the service", async () => {
    expect((await hardDeleteTenantAction(orgA, "acme")).ok).toBe(false);
    await hardDeleteTenantAction(orgA, "acme", "customer requested closure");
    expect(PlatformService.hardDeleteTenant).toHaveBeenCalledWith(orgA, "acme", expect.any(String), "customer requested closure");
  });
});
