import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { AuditService } from "@/domains/audit/service";
import { NotificationService } from "@/domains/notifications/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/domains/notifications/service", () => ({ NotificationService: { create: vi.fn(), notifyOrgAdmins: vi.fn() } }));
vi.mock("@/domains/leads/customStatusSchemaService", () => ({ CustomStatusSchemaService: { getStatusCategoryMap: vi.fn() } }));

import { EscalationService } from "./escalationService";

// Perf finding: an unthrottled per-lead audit row every 15 minutes can flood an org's own audit
// page. One summary row per scan (per org) instead — the per-lead notification and escalatedAt
// stamp are unaffected.
describe("EscalationService.runForOrg audit — perf fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.update as any).mockReturnValue({ set: () => ({ where: () => Promise.resolve(undefined) }) });
    (CustomStatusSchemaService.getStatusCategoryMap as any).mockResolvedValue(new Map([["new", "open"]]));
  });

  it("logs exactly one audit entry for a scan that escalates several leads", async () => {
    (db.select as any)
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ slaHours: 4 }]) }) }) }) // org lookup
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([
        { id: "lead-1", name: "A", ownerId: "user-1" },
        { id: "lead-2", name: "B", ownerId: null },
        { id: "lead-3", name: "C", ownerId: "user-2" },
      ]) }) });

    const count = await EscalationService.runForOrg("org-a");

    expect(count).toBe(3);
    expect(AuditService.log).toHaveBeenCalledTimes(1);
    expect(AuditService.log).toHaveBeenCalledWith({
      organizationId: "org-a",
      action: "lead.sla_escalated",
      entityType: "organization",
      entityId: "org-a",
      metadata: { hours: 4, count: 3, sampleLeadIds: ["lead-1", "lead-2", "lead-3"] },
    });
    // Still one notification per lead — only the audit fan-out changed.
    expect(NotificationService.create).toHaveBeenCalledTimes(2);
    expect(NotificationService.notifyOrgAdmins).toHaveBeenCalledTimes(1);
  });

  it("logs nothing when no lead is past the SLA window", async () => {
    (db.select as any)
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ slaHours: 4 }]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });

    const count = await EscalationService.runForOrg("org-a");

    expect(count).toBe(0);
    expect(AuditService.log).not.toHaveBeenCalled();
  });
});
