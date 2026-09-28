import { describe, it, expect, vi, beforeEach } from "vitest";
import { DedupService } from "./dedupService";
import { db } from "@/db";
import { AuditService } from "@/domains/audit/service";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn(), execute: vi.fn() } }));
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));

function mockLeads(rows: any[]) {
  (db.select as any).mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
}

// Queue the three selects autoMergeOnCreate runs: incoming, org flag, primary match.
function mockAutoMerge(incoming: any, orgOn: number, primary: any[]) {
  (db.select as any).mockReset();
  (db.update as any).mockReset();
  (db.select as any)
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve(incoming ? [incoming] : []) }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ on: orgOn }]) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(primary) }) }) }) });
  (db.update as any).mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
}

describe("DedupService.findDuplicateGroups", () => {
  beforeEach(() => vi.clearAllMocks());
  const row = (k: string, id: string) => ({ k, id, name: id, email: null, phone: null, created_at: new Date().toISOString() });

  // Postgres returns only rows whose normalized key is shared; the service groups them.
  it("groups rows by shared key and collapses email+phone matches of the same leads", async () => {
    (db.execute as any).mockResolvedValue([
      row("e:x@y.com", "1"), row("e:x@y.com", "2"),
      row("p:5551112222", "3"), row("p:5551112222", "4"),
      row("p:999", "1"), row("p:999", "2"), // same pair as the email group
    ]);
    const groups = await DedupService.findDuplicateGroups("org");
    expect(groups.map((g) => g.leads.map((l) => l.id).sort().join(","))).toEqual(["1,2", "3,4"]);
  });

  it("returns nothing when no key is shared", async () => {
    (db.execute as any).mockResolvedValue([]);
    expect(await DedupService.findDuplicateGroups("org")).toEqual([]);
  });
});

describe("DedupService.autoMergeOnCreate", () => {
  beforeEach(() => vi.clearAllMocks());

  const incoming = { id: "new", organizationId: "org", email: "a@x.com", phone: "555", company: "Acme", name: "Ada", customData: { utm: "fb" }, deletedAt: null };

  it("merges the arrival into the older existing lead when enabled", async () => {
    const primary = { id: "old", organizationId: "org", email: "a@x.com", phone: null, company: null, name: "A", customData: { plan: "pro" }, createdAt: new Date(0), deletedAt: null };
    mockAutoMerge(incoming, 1, [primary]);
    const mergeSpy = vi.spyOn(DedupService, "merge").mockResolvedValue(undefined as any);

    const result = await DedupService.autoMergeOnCreate("new");

    expect(result).toBe(true);
    expect(mergeSpy).toHaveBeenCalledWith("org", "old", "new"); // older kept as primary
    expect((db.update as any)).toHaveBeenCalled(); // backfilled primary's blank phone/company
  });

  // A6/A13: this hard-deletes the arrival with no user action in the loop — it needs its own
  // audit trail, and the merged lead's identity has to be captured before merge() deletes it.
  it("logs a System-attributed lead.auto_merge with the merged lead's identity snapshotted", async () => {
    const primary = { id: "old", organizationId: "org", email: "a@x.com", phone: null, company: null, name: "A", customData: { plan: "pro" }, createdAt: new Date(0), deletedAt: null };
    mockAutoMerge(incoming, 1, [primary]);
    vi.spyOn(DedupService, "merge").mockResolvedValue(undefined as any);

    await DedupService.autoMergeOnCreate("new");

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org",
        action: "lead.auto_merge",
        entityType: "lead",
        entityId: "old",
        metadata: expect.objectContaining({ mergedLead: { name: "Ada", email: "a@x.com", phone: "555" }, matchedOn: "email" }),
      }),
    );
    expect(AuditService.log).not.toHaveBeenCalledWith(expect.objectContaining({ userId: expect.anything() }));
  });

  it("does nothing when auto-merge is off for the org", async () => {
    mockAutoMerge(incoming, 0, [{ id: "old" }]);
    const mergeSpy = vi.spyOn(DedupService, "merge").mockResolvedValue(undefined as any);
    expect(await DedupService.autoMergeOnCreate("new")).toBe(false);
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the arrival has no email or phone", async () => {
    mockAutoMerge({ ...incoming, email: null, phone: null }, 1, [{ id: "old" }]);
    const mergeSpy = vi.spyOn(DedupService, "merge").mockResolvedValue(undefined as any);
    expect(await DedupService.autoMergeOnCreate("new")).toBe(false);
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it("does nothing when no existing lead matches", async () => {
    mockAutoMerge(incoming, 1, []);
    const mergeSpy = vi.spyOn(DedupService, "merge").mockResolvedValue(undefined as any);
    expect(await DedupService.autoMergeOnCreate("new")).toBe(false);
    expect(mergeSpy).not.toHaveBeenCalled();
  });
});
