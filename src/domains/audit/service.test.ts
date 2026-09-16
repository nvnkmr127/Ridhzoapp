import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what AuditService hands to drizzle so we can assert on the row and the scoping clause.
const insertValues = vi.fn();
const whereSpy = vi.fn();
const listLimitSpy = vi.fn().mockResolvedValue([]);
// Actor-lookup path (select(...).from(users).where(...).limit(1)) — no user found by default;
// individual tests override this to exercise the snapshot-at-write-time behavior.
const actorLimitSpy = vi.fn().mockResolvedValue([]);

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValues })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        // AuditService.log's actor lookup: .from(users).where(...).limit(1)
        where: vi.fn(() => ({ limit: actorLimitSpy })),
        // AuditService.list's read: .from(auditLogs).leftJoin(users).where(...).orderBy(...).limit(n)
        leftJoin: vi.fn(() => ({
          where: (...args: unknown[]) => {
            whereSpy(...args);
            return { orderBy: vi.fn(() => ({ limit: listLimitSpy })) };
          },
        })),
      })),
    })),
  },
}));

import { AuditService } from "./service";

// Recursively pulls every string leaf out of a drizzle SQL condition tree, guarding against the
// cycle a column's back-reference to its table would otherwise cause.
function collectStrings(node: unknown, seen = new Set<unknown>(), depth = 0): string[] {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object" || depth > 12 || seen.has(node)) return [];
  seen.add(node);
  const items = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
  return items.flatMap((v) => collectStrings(v, seen, depth + 1));
}

describe("AuditService.log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockResolvedValue(undefined);
    actorLimitSpy.mockResolvedValue([]);
  });

  it("records a user-attributed event with the fields it was given, snapshotting the actor", async () => {
    actorLimitSpy.mockResolvedValue([{ firstName: "Priya", lastName: "Nair", email: "priya@example.com" }]);

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
      actorName: "Priya Nair",
      actorEmail: "priya@example.com",
      action: "api_key.create",
      entityType: "api_key",
      entityId: "key-1",
      metadata: { name: "CI key", scope: "read_only" },
    });
  });

  it("stores userId (and the actor snapshot) as null for system/background actions so the UI renders 'System'", async () => {
    await AuditService.log({ organizationId: "org-a", action: "lead.sla_escalated", entityType: "lead", entityId: "lead-1" });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, actorName: null, actorEmail: null, entityType: "lead", metadata: {} }),
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
  beforeEach(() => {
    vi.clearAllMocks();
    listLimitSpy.mockResolvedValue([]);
  });

  it("filters on the organization id it was given (tenant scoping)", async () => {
    await AuditService.list("org-a");
    expect(whereSpy).toHaveBeenCalledTimes(1);
    // Drizzle's SQL tree nests (and() wraps a lone clause in another SQL node) and its column
    // objects carry a circular back-reference to their table, so walk it with cycle protection
    // instead of JSON.stringify-ing the whole thing, and assert the bound param surfaces somewhere.
    expect(collectStrings(whereSpy.mock.calls[0][0])).toContain("org-a");
  });

  it("caps the result set at 100 rows by default, requesting one extra row to detect a next page", async () => {
    await AuditService.list("org-a");
    expect(listLimitSpy).toHaveBeenCalledWith(101);
  });

  it("honors a caller-supplied limit the same way", async () => {
    await AuditService.list("org-a", { limit: 250 });
    expect(listLimitSpy).toHaveBeenCalledWith(251);
  });

  it("returns a nextCursor only when more rows exist beyond the page", async () => {
    listLimitSpy.mockResolvedValue([{ id: "row-1", createdAt: new Date("2026-01-01T00:00:00Z") }]);
    const { nextCursor } = await AuditService.list("org-a", { limit: 1 });
    expect(nextCursor).toBeNull(); // only 1 row came back for a limit of 1 — no overflow row

    listLimitSpy.mockResolvedValue([
      { id: "row-1", createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "row-2", createdAt: new Date("2026-01-01T00:00:00Z") }, // the overflow row
    ]);
    const page2 = await AuditService.list("org-a", { limit: 1 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.nextCursor).toEqual(expect.any(String));
  });
});
