import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { authorizeApiRequest } from "@/lib/apiAuth";
import { hasPermissionForRoleId } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { MeetingService } from "@/domains/meetings/service";

vi.mock("@/lib/apiAuth", () => ({ authorizeApiRequest: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ hasPermissionForRoleId: vi.fn() }));
vi.mock("@/lib/leads/access", () => ({ attendsMeetingWith: vi.fn().mockResolvedValue(false) }));
vi.mock("@/domains/leads/service", () => ({ LeadService: { getLead: vi.fn() } }));
vi.mock("@/domains/meetings/service", () => ({ MeetingService: { create: vi.fn(), listForLead: vi.fn(), canAutoMeet: vi.fn(), get: vi.fn() } }));

import { POST } from "./route";

const LEAD = "11111111-1111-4111-8111-111111111111";
const future = new Date(Date.now() + 86_400_000).toISOString();
const post = (body: unknown) =>
  POST(new NextRequest(`http://localhost/api/v1/leads/${LEAD}/meetings`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: LEAD }) });
const siteVisit = { mode: "site_visit", startAt: future, durationMinutes: 30, address: "Plot 12" };

describe("POST /api/v1/leads/[id]/meetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (LeadService.getLead as any).mockResolvedValue({ id: LEAD, ownerId: "owner-1" });
    (MeetingService.create as any).mockResolvedValue({
      meeting: { id: "m1", leadId: LEAD, mode: "site_visit", title: "Site visit", status: "scheduled", startAt: new Date(future), durationMinutes: 30, createdAt: new Date() },
      notice: { whatsappText: "Hi", emailed: false, whatsappSent: false },
    });
  });

  it("hides another rep's lead from a mobile user (404) and books nothing", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1", userId: "rep-2", roleId: "rep" });
    (hasPermissionForRoleId as any).mockResolvedValue(false);
    expect((await post(siteVisit)).status).toBe(404);
    expect(MeetingService.create).not.toHaveBeenCalled();
  });

  it("books for the lead's owner", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1", userId: "owner-1", roleId: "rep" });
    (hasPermissionForRoleId as any).mockResolvedValue(false);
    const res = await post(siteVisit);
    expect(res.status).toBe(201);
    expect(MeetingService.create).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, mode: "site_visit" }), { userId: "owner-1", organizationId: "org-1" });
  });

  it("rejects a site visit with no place (422)", async () => {
    (authorizeApiRequest as any).mockResolvedValue({ organizationId: "org-1" });
    expect((await post({ ...siteVisit, address: undefined })).status).toBe(422);
  });
});
