import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what AuditService hands to drizzle so we can assert on the row and the scoping clause.
const insertValues = vi.fn();
const whereSpy = vi.fn();
const limitSpy = vi.fn().mockResolvedValue([]);

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValues })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: (...args: unknown[]) => {
            whereSpy(...args);
            return { orderBy: vi.fn(() => ({ limit: limitSpy })) };
          },
        })),
      })),
    })),
  },
}));

import { AuditService } from "./service";

describe("AuditService.log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockResolvedValue(undefined);
  });

  it("records a user-attributed event with the fields it was given", async () => {
    await AuditService.log({
      organizationId: "org-a",
      userId: "user-1",
      action: "api_key.create",
      entityType: "api_key",
      entityId: "key-1",
      metadata: { name: "CI key", scope: "read_only" },
    });

    expect(insertValues).toHaveBeenCalledWith({
      organizationId: "org-a",
      userId: "user-1",
      action: "api_key.create",
      entityType: "api_key",
      entityId: "key-1",
      metadata: { name: "CI key", scope: "read_only" },
    });
  });

  it("stores userId as null for system/background actions so the UI renders 'System'", async () => {
    await AuditService.log({ organizationId: "org-a", action: "lead.sla_escalated", entityType: "lead", entityId: "lead-1" });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, entityType: "lead", metadata: {} }),
    );
  });

  // Best-effort by design: the business operation must survive an audit outage.
  it("swallows a database failure instead of throwing", async () => {
    insertValues.mockRejectedValue(new Error("ECONNREFUSED"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(AuditService.log({ organizationId: "org-a", action: "user.delete" })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  // The flip side of best-effort: the event is gone and the caller is never told.
  it("gives the caller no signal that the event was dropped", async () => {
    insertValues.mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await AuditService.log({ organizationId: "org-a", action: "user.delete" });
    expect(result).toBeUndefined(); // same return value as a successful write
  });

  // Non-serializable metadata is a synchronous throw inside the driver, not a DB error.
  it("swallows metadata serialization failures too", async () => {
    insertValues.mockImplementation(() => {
      throw new TypeError("Converting circular structure to JSON");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(
      AuditService.log({ organizationId: "org-a", action: "org.settings_update", metadata: cyclic }),
    ).resolves.toBeUndefined();
  });
});

describe("AuditService.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters on the organization id it was given (tenant scoping)", async () => {
    await AuditService.list("org-a");
    expect(whereSpy).toHaveBeenCalledTimes(1);
    // Drizzle renders eq(audit_logs.organization_id, $1); dig the bound param out of the SQL chunks.
    const chunks = (whereSpy.mock.calls[0][0] as { queryChunks: { value?: unknown }[] }).queryChunks;
    const bound = chunks.filter((c) => c && "value" in c).map((c) => c.value);
    expect(bound).toContainEqual("org-a");
  });

  it("caps the result set at 100 rows by default", async () => {
    await AuditService.list("org-a");
    expect(limitSpy).toHaveBeenCalledWith(100);
  });

  // There is no offset/cursor parameter: everything before the newest `limit` rows is
  // unreachable through this API — a caller can only ask for a bigger head of the list.
  it("takes only an org and a limit, so older history can never be paged to", async () => {
    await AuditService.list("org-a", 250);
    expect(limitSpy).toHaveBeenCalledWith(250);
    expect(AuditService.list).toHaveLength(1); // one required param; `limit` is the only option
  });
});
