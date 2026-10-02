import { describe, it, expect, vi, beforeEach } from "vitest";

// The cap is enforced by the atomic upsert's WHERE: no returned row = over the allowance.
const returning = vi.fn();
const plan = vi.hoisted(() => ({ max: 100 }));
vi.mock("@/db", () => ({
  db: { insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: (...a: unknown[]) => returning(...a) }) }) }) },
}));
vi.mock("@/db/schema", () => ({ usageCounters: {}, leadAttachments: {} }));
vi.mock("drizzle-orm", () => ({ and: () => 0, eq: () => 0, sql: () => 0 }));
vi.mock("./planService", () => ({
  PlanService: { plan: async () => "free" },
  limitsFor: () => ({ messages: plan.max, emails: Infinity, exports: 5, importRows: 500, storageMb: 100 }),
  currentPeriod: () => "2026-10",
}));

import { UsageService, UsageLimitError } from "./usageService";

describe("UsageService.consume", () => {
  beforeEach(() => { returning.mockReset(); plan.max = 100; });
  it("passes when the upsert returns a row", async () => {
    returning.mockResolvedValue([{ used: 5 }]);
    await expect(UsageService.consume("o", "messages")).resolves.toBeUndefined();
  });
  it("throws a LIMIT error (mentions 'plan') when the upsert is refused", async () => {
    returning.mockResolvedValue([]);
    const e = await UsageService.consume("o", "messages").catch((x) => x);
    expect(e).toBeInstanceOf(UsageLimitError);
    expect(e.message).toMatch(/plan/i);
  });
  it("refuses a single request bigger than the whole allowance without touching the DB", async () => {
    await expect(UsageService.consume("o", "import_rows", 501)).rejects.toBeInstanceOf(UsageLimitError);
    expect(returning).not.toHaveBeenCalled();
  });
  it("skips unmetered metrics entirely", async () => {
    await UsageService.consume("o", "emails", 10_000);
    expect(returning).not.toHaveBeenCalled();
  });
});
