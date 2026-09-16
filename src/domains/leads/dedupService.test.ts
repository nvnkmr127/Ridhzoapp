import { describe, it, expect, vi, beforeEach } from "vitest";
import { DedupService } from "./dedupService";
import { db } from "@/db";
import { AuditService } from "@/domains/audit/service";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
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

  it("groups by normalized email and phone, ignoring uniques", async () => {
    mockLeads([
      { id: "1", name: "A", email: "x@y.com", phone: null, createdAt: new Date() },
      { id: "2", name: "B", email: "X@Y.com", phone: null, createdAt: new Date() },     // same email, diff case
      { id: "3", name: "C", email: null, phone: "(555) 111-2222", createdAt: new Date() },
      { id: "4", name: "D", email: null, phone: "5551112222", createdAt: new Date() },  // same phone, punctuation differs
      { id: "5", name: "E", email: "solo@z.com", phone: "999", createdAt: new Date() }, // unique
    ]);

    const groups = await DedupService.findDuplicateGroups("org");
    const ids = groups.map((g) => g.leads.map((l) => l.id).sort().join(","));
    expect(ids).toContain("1,2"); // email match, case-insensitive
    expect(ids).toContain("3,4"); // phone match, punctuation-insensitive
    expect(groups.every((g) => !g.leads.some((l) => l.id === "5"))).toBe(true);
  });

  it("returns nothing when all leads are distinct", async () => {
    mockLeads([
      { id: "1", name: "A", email: "a@a.com", phone: "1", createdAt: new Date() },
      { id: "2", name: "B", email: "b@b.com", phone: "2", createdAt: new Date() },
    ]);
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
