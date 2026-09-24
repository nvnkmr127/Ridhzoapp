import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuditService } from "@/domains/audit/service";
import { LeadService } from "@/domains/leads/service";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { hasPermissionForRoleId } from "@/lib/rbac";

vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/domains/leads/service", () => ({ LeadService: { deleteLead: vi.fn(), getLead: vi.fn(), updateLead: vi.fn(), changeStatus: vi.fn(), updateCustomData: vi.fn() } }));
vi.mock("@/domains/activities/service", () => ({ ActivityService: { getLeadActivities: vi.fn() } }));
vi.mock("@/lib/apiAuth", () => ({ authorizeApiRequest: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ hasPermissionForRoleId: vi.fn() }));

const LEAD_ID = "11111111-1111-4111-8111-111111111111";

import { DELETE } from "./route";

function del() {
  return DELETE(new NextRequest(`http://localhost/api/v1/leads/${LEAD_ID}`, { method: "DELETE" }), { params: Promise.resolve({ id: LEAD_ID }) });
}

const log = AuditService.log as unknown as ReturnType<typeof vi.fn>;

describe("DELETE /api/v1/leads/[id] — A2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route loads the lead first (tenant + ownership check) before deleting.
    (LeadService.getLead as any).mockResolvedValue({ id: LEAD_ID, ownerId: "user-1" });
  });

  it("writes a lead.delete audit entry, attributed to System, for a plain API key", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1" }); // no userId/roleId: API key
    (LeadService.deleteLead as any).mockResolvedValue({ id: LEAD_ID });

    const res = await del();

    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", userId: null, action: "lead.delete", entityId: LEAD_ID }),
    );
  });

  it("rejects a mobile-token request whose role lacks leads.delete, and writes no audit entry", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1", userId: "user-1", roleId: "viewer-role" });
    (hasPermissionForRoleId as any).mockResolvedValue(false);

    const res = await del();

    expect(res.status).toBe(403);
    expect(LeadService.deleteLead).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("allows and audits a mobile-token request whose role holds leads.delete, attributed to that user", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1", userId: "user-1", roleId: "admin-role" });
    (hasPermissionForRoleId as any).mockResolvedValue(true);
    (LeadService.deleteLead as any).mockResolvedValue({ id: LEAD_ID });

    const res = await del();

    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", action: "lead.delete" }));
  });

  it("writes no audit entry when the lead didn't exist", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1" });
    (LeadService.getLead as any).mockResolvedValue(undefined);
    (LeadService.deleteLead as any).mockResolvedValue(undefined);

    const res = await del();

    expect(res.status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });
});
