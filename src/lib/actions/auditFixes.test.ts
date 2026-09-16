import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "@/domains/audit/service";
import { RoleService } from "@/domains/roles/service";
import { LeadService } from "@/domains/leads/service";
import { DedupService } from "@/domains/leads/dedupService";
import { OrgService } from "@/domains/organizations/service";

vi.mock("@/lib/rbac", () => ({
  requireOrg: vi.fn().mockResolvedValue({ organizationId: "org-a", userId: "admin-a" }),
  requirePermission: vi.fn().mockResolvedValue({ organizationId: "org-a", userId: "admin-a" }),
  hasPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/domains/roles/service", () => ({
  RoleService: { update: vi.fn(), getById: vi.fn(), remove: vi.fn(), create: vi.fn() },
}));
vi.mock("@/domains/leads/service", () => ({
  LeadService: { deleteLead: vi.fn(), getLead: vi.fn(), emptyRecycleBin: vi.fn() },
}));
vi.mock("@/domains/leads/dedupService", () => ({ DedupService: { merge: vi.fn(), findDuplicateGroups: vi.fn() } }));
vi.mock("@/domains/organizations/service", () => ({
  OrgService: { getOrganization: vi.fn(), updateOrganization: vi.fn() },
}));
vi.mock("@/db", () => ({ db: {} }));

import { updateRoleAction } from "./roles";
import { bulkDeleteLeadsAction } from "./leads";
import { mergeLeadsAction } from "./dedup";
import { updateOrganizationAction } from "./organizations";

const log = AuditService.log as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("role.update audit — A3", () => {
  it("logs added/removed permissions computed against the pre-image", async () => {
    (RoleService.getById as any).mockResolvedValue({ id: "role-1", name: "Ops", permissions: ["leads.edit"], organizationId: "org-a" });
    (RoleService.update as any).mockResolvedValue({ id: "role-1", name: "Ops", permissions: ["leads.edit", "billing.manage"], organizationId: "org-a" });

    await updateRoleAction("role-1", { permissions: ["leads.edit", "billing.manage"] });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.update", entityId: "role-1", metadata: { name: "Ops", added: ["billing.manage"], removed: [] } }),
    );
  });

  it("does not log when the permission set is unchanged (e.g. a name-only rename)", async () => {
    (RoleService.getById as any).mockResolvedValue({ id: "role-1", name: "Ops", permissions: ["leads.edit"], organizationId: "org-a" });
    (RoleService.update as any).mockResolvedValue({ id: "role-1", name: "Operations", permissions: ["leads.edit"], organizationId: "org-a" });

    await updateRoleAction("role-1", { name: "Operations", permissions: ["leads.edit"] });

    expect(log).not.toHaveBeenCalled();
  });
});

describe("lead.bulk_delete audit — A1/A8", () => {
  it("does not log when nothing was actually deleted", async () => {
    (LeadService.deleteLead as any).mockResolvedValue(undefined); // every id was already gone

    const res = await bulkDeleteLeadsAction({ leadIds: ["11111111-1111-1111-1111-111111111111"] });

    expect(res.ok).toBe(true); // still reports the (zero) outcome to the caller
    expect(log).not.toHaveBeenCalled();
  });

  it("logs counts and a sample of the deleted ids when something was deleted", async () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    (LeadService.deleteLead as any).mockImplementation((id: string) => (id === id1 ? { id } : undefined));

    await bulkDeleteLeadsAction({ leadIds: [id1, id2] });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.bulk_delete",
        metadata: expect.objectContaining({ requested: 2, deleted: 1, failed: 1, sampleIds: [id1] }),
      }),
    );
  });
});

const PRIMARY_ID = "11111111-1111-4111-8111-111111111111";
const DUP_ID = "22222222-2222-4222-8222-222222222222";

describe("lead.merge audit — A13", () => {
  it("snapshots the merged lead's identity before it is hard-deleted", async () => {
    (LeadService.getLead as any).mockResolvedValue({ id: DUP_ID, name: "Jane Doe", email: "jane@example.com", phone: "555-0100" });
    (DedupService.merge as any).mockResolvedValue(undefined);

    await mergeLeadsAction({ primaryId: PRIMARY_ID, duplicateId: DUP_ID });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.merge",
        entityId: PRIMARY_ID,
        metadata: { mergedLead: { id: DUP_ID, name: "Jane Doe", email: "jane@example.com", phone: "555-0100" } },
      }),
    );
  });
});

// Every field updateOrgSchema produces, so the diff isolates exactly the fields the test changes
// rather than picking up spurious "undefined in the fixture vs null after zod's transform" noise.
const BASE_SETTINGS = {
  name: "Co", timezone: "UTC", locale: "en", currency: "USD", dateFormat: "MM/DD/YYYY",
  industry: null, aiContext: null, phone: null, website: null,
  addressLine1: null, city: null, state: null, postalCode: null, country: null,
  slaHours: 24, sequenceWindowStart: null, sequenceWindowEnd: null,
  whatsappMode: "personal", requiredLeadFields: ["name"],
};

describe("org.settings_update audit — A4", () => {
  it("records changedFields and old/new values for operational fields only", async () => {
    (OrgService.getOrganization as any).mockResolvedValue({ ...BASE_SETTINGS, name: "Old Co" });
    (OrgService.updateOrganization as any).mockResolvedValue({ ...BASE_SETTINGS, slaHours: 48, name: "New Co" });

    await updateOrganizationAction({ ...BASE_SETTINGS, name: "New Co", slaHours: 48 } as any);

    expect(log).toHaveBeenCalledTimes(1);
    const meta = log.mock.calls[0][0].metadata;
    expect(meta.changedFields.sort()).toEqual(["name", "slaHours"]);
    expect(meta.values).toEqual({ slaHours: { old: 24, new: 48 } }); // "name" is free text — no value recorded
  });

  it("does not log when nothing actually changed", async () => {
    (OrgService.getOrganization as any).mockResolvedValue(BASE_SETTINGS);
    (OrgService.updateOrganization as any).mockResolvedValue(BASE_SETTINGS);

    await updateOrganizationAction({ ...BASE_SETTINGS } as any);

    expect(log).not.toHaveBeenCalled();
  });
});
