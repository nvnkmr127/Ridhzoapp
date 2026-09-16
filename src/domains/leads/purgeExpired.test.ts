import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { AuditService } from "@/domains/audit/service";

vi.mock("@/db", () => ({ db: { select: vi.fn(), delete: vi.fn() } }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));

import { LeadService } from "./service";

// A6: the daily recycle-bin purge sweeps every organization in one query — this locks down that
// it still attributes the audit trail per organization, not as one global, unscoped entry.
describe("LeadService.purgeExpired audit — A6", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // First select: purgeExpired's own "what's expired" query, across two different orgs.
    // Second select: the followUps lookup inside hardDeleteLeads (empty → skips the reminders delete).
    (db.select as any)
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([
        { id: "lead-1", organizationId: "org-a" },
        { id: "lead-2", organizationId: "org-a" },
        { id: "lead-3", organizationId: "org-b" },
      ]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });

    const whereResult = { returning: vi.fn().mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }, { id: "lead-3" }]) };
    (db.delete as any).mockReturnValue({ where: () => whereResult });
  });

  it("logs one lead.auto_purge per organization touched, with that org's own count", async () => {
    await LeadService.purgeExpired(30);

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a", action: "lead.auto_purge", metadata: { purgedCount: 2, olderThanDays: 30 } }),
    );
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-b", action: "lead.auto_purge", metadata: { purgedCount: 1, olderThanDays: 30 } }),
    );
    expect(AuditService.log).toHaveBeenCalledTimes(2); // not one entry per lead
  });

  it("logs nothing when there is nothing expired", async () => {
    (db.select as any).mockReset();
    (db.select as any).mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });

    await LeadService.purgeExpired(30);

    expect(AuditService.log).not.toHaveBeenCalled();
  });
});
