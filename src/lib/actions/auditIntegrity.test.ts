import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "@/domains/audit/service";
import { ApiKeyService } from "@/domains/apiKeys/service";
import { RoleService } from "@/domains/roles/service";
import { InvitationService } from "@/domains/invitations/service";
import { UserService } from "@/domains/users/service";

vi.mock("@/lib/rbac", () => ({
  requireOrg: vi.fn().mockResolvedValue({ organizationId: "org-a", userId: "admin-a" }),
  requirePermission: vi.fn().mockResolvedValue({ organizationId: "org-a", userId: "admin-a" }),
  hasPermission: vi.fn().mockResolvedValue(true),
  roleAssignmentError: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/domains/apiKeys/service", () => ({ ApiKeyService: { revoke: vi.fn(), remove: vi.fn(), create: vi.fn() } }));
vi.mock("@/domains/roles/service", () => ({ RoleService: { remove: vi.fn(), create: vi.fn() } }));
vi.mock("@/domains/invitations/service", () => ({ InvitationService: { revoke: vi.fn() } }));
vi.mock("@/domains/users/service", () => ({ UserService: { remove: vi.fn(), setRole: vi.fn() } }));
vi.mock("@/domains/billing/planService", () => ({ PlanService: { assertCanAddSeat: vi.fn() }, PLAN_LIMITS: {} }));
vi.mock("@/db", () => ({ db: {} }));

import { revokeApiKeyAction, deleteApiKeyAction } from "./apiKeys";
import { deleteRoleAction } from "./roles";
import { revokeInvitationAction } from "./invitations";
import { deleteUserAction, setUserRoleAction } from "./users";

const log = AuditService.log as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// These services return undefined when the id matches 0 rows.
// The actions must suppress audit logging and return NOT_FOUND.
describe("audit entries suppressed when operation matches no row in this org", () => {
  it("api_key.revoke is not recorded when the key matched no row in this org", async () => {
    (ApiKeyService.revoke as any).mockResolvedValue(undefined); // 0 rows updated

    const res = await revokeApiKeyAction("key-owned-by-org-b");

    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("api_key.delete is not recorded when the key matched no row in this org", async () => {
    (ApiKeyService.remove as any).mockResolvedValue(undefined);
    const res = await deleteApiKeyAction("key-owned-by-org-b");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("role.delete is not recorded when the role matched no row in this org", async () => {
    (RoleService.remove as any).mockResolvedValue(undefined);
    const res = await deleteRoleAction("role-owned-by-org-b");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("invitation.revoke is not recorded when the invitation matched no row in this org", async () => {
    (InvitationService.revoke as any).mockResolvedValue(undefined);
    const res = await revokeInvitationAction("invite-owned-by-org-b");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

// The user actions check the returned row first — this is the pattern the four above are missing.
describe("actions that correctly suppress the audit entry on a no-op", () => {
  it("user.delete is not recorded when no live row matched", async () => {
    (UserService.remove as any).mockResolvedValue(undefined);
    const res = await deleteUserAction("user-owned-by-org-b");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("user.role_change is not recorded when no live row matched", async () => {
    (UserService.setRole as any).mockResolvedValue(undefined);
    const res = await setUserRoleAction("user-owned-by-org-b", "role-1");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

// A failed business operation must not leave a success-shaped audit entry behind.
describe("failed operations", () => {
  it("does not record user.delete when the service throws", async () => {
    (UserService.remove as any).mockRejectedValue(new Error("Cannot remove the last active administrator of this organization."));
    const res = await deleteUserAction("user-1");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("does not record api_key.revoke when the service throws", async () => {
    (ApiKeyService.revoke as any).mockRejectedValue(new Error("connection terminated"));
    const res = await revokeApiKeyAction("key-1");
    expect(res.ok).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

// Metadata must never carry the plaintext key. create() returns it; the audit call must not use it.
describe("metadata never carries the raw API key", () => {
  it("logs only the name and scope", async () => {
    const { createApiKeyAction } = await import("./apiKeys");
    (ApiKeyService.create as any).mockResolvedValue({ id: "key-1", name: "CI", prefix: "pk_abc123", scope: "full", key: "pk_SUPERSECRETRAWKEY" });

    await createApiKeyAction("CI", "full");

    const meta = log.mock.calls[0][0].metadata;
    expect(meta).toEqual({ name: "CI", scope: "full" });
    expect(JSON.stringify(log.mock.calls[0][0])).not.toContain("SUPERSECRETRAWKEY");
  });
});
