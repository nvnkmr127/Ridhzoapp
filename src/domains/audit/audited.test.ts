import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
vi.mock("@/db", () => ({ db: { insert: () => ({ values: (v: unknown) => insert(v) }), select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

import { AuditService } from "./service";

describe("AuditService.audited", () => {
  beforeEach(() => insert.mockReset());

  it("returns the result and writes one entry derived from it", async () => {
    const r = await AuditService.audited<{ id: string }>({ organizationId: "o1", userId: null }, { action: "x.create", entityType: "x", entityId: (res) => res.id, metadata: (res) => ({ id: res.id }) }, async () => ({ id: "11111111-1111-4111-8111-111111111111" }));
    expect(r.id).toBeDefined();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ organizationId: "o1", action: "x.create", entityId: "11111111-1111-4111-8111-111111111111" });
  });

  it("writes nothing when the operation throws", async () => {
    await expect(AuditService.audited({ organizationId: "o1" }, { action: "x.fail" }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(insert).not.toHaveBeenCalled();
  });
});
