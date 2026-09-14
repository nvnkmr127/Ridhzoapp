import { describe, it, expect, vi, beforeEach } from "vitest";
import { SequenceService } from "./sequenceService";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
const addActivity = vi.fn();
vi.mock("@/domains/activities/service", () => ({ ActivityService: { addActivity: (...a: any[]) => addActivity(...a) } }));

function mockLeadOrg(rows: any[]) {
  (db.select as any).mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
}

describe("SequenceService.enrollFromAutomation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the lead's org and enrolls it into the sequence", async () => {
    mockLeadOrg([{ organizationId: "org-1" }]);
    const enroll = vi.spyOn(SequenceService, "enroll").mockResolvedValue({ enrolled: 1 } as any);

    const res = await SequenceService.enrollFromAutomation("seq-1", "lead-1");

    expect(enroll).toHaveBeenCalledWith("org-1", "seq-1", ["lead-1"]);
    expect(res).toEqual({ enrolled: 1 });
  });

  it("no-ops when the lead has no org (deleted/not found)", async () => {
    mockLeadOrg([]);
    const enroll = vi.spyOn(SequenceService, "enroll").mockResolvedValue({ enrolled: 0 } as any);

    const res = await SequenceService.enrollFromAutomation("seq-1", "missing");

    expect(enroll).not.toHaveBeenCalled();
    expect(res).toEqual({ enrolled: 0 });
  });
});

describe("SequenceService.stopForLead", () => {
  beforeEach(() => { vi.clearAllMocks(); addActivity.mockResolvedValue(undefined); });

  it("stops active enrollments and logs a reason note", async () => {
    (db.update as any).mockReturnValue({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: "e1" }, { id: "e2" }]) }) }) });
    const res = await SequenceService.stopForLead("lead-1", "lead replied on WhatsApp");
    expect(res).toEqual({ stopped: 2 });
    expect(addActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1", type: "note" }));
  });

  it("no note when nothing was active", async () => {
    (db.update as any).mockReturnValue({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) });
    const res = await SequenceService.stopForLead("lead-1", "lead marked won");
    expect(res).toEqual({ stopped: 0 });
    expect(addActivity).not.toHaveBeenCalled();
  });
});
