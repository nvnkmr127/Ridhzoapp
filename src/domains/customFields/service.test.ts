import { describe, it, expect, vi, beforeEach } from "vitest";
import { CustomFieldService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

function mockDefs(defs: any[]) {
  (db.select as any).mockReturnValue({
    from: () => ({ where: () => ({ orderBy: () => Promise.resolve(defs) }) }),
  });
}

describe("CustomFieldService.validate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when a required field is missing", async () => {
    mockDefs([{ key: "budget", label: "Budget", type: "number", required: true, options: [] }]);
    await expect(CustomFieldService.validate("org", {})).rejects.toThrow(/Budget/);
  });

  it("coerces numbers and rejects non-numeric", async () => {
    mockDefs([{ key: "budget", label: "Budget", type: "number", required: false, options: [] }]);
    expect(await CustomFieldService.validate("org", { budget: "42" })).toEqual({ budget: 42 });
    await expect(CustomFieldService.validate("org", { budget: "abc" })).rejects.toThrow(/number/);
  });

  it("enforces select options", async () => {
    mockDefs([{ key: "tier", label: "Tier", type: "select", required: false, options: ["A", "B"] }]);
    expect(await CustomFieldService.validate("org", { tier: "A" })).toEqual({ tier: "A" });
    await expect(CustomFieldService.validate("org", { tier: "Z" })).rejects.toThrow(/one of/);
  });

  it("drops unknown keys not defined for the org", async () => {
    mockDefs([{ key: "budget", label: "Budget", type: "text", required: false, options: [] }]);
    expect(await CustomFieldService.validate("org", { budget: "x", evil: "y" })).toEqual({ budget: "x" });
  });
});

describe("CustomFieldService.validateWith — lenient (inbound ingestion)", () => {
  const defs = [
    { key: "budget", label: "Budget", type: "number", required: false, options: [], disabled: false, adminOnly: false },
    { key: "tier", label: "Tier", type: "select", required: true, options: ["A", "B"], disabled: false, adminOnly: false },
  ] as any;

  it("coerces good values and skips bad ones instead of throwing", () => {
    const out = CustomFieldService.validateWith(defs, { budget: "1,200", tier: "Z" }, { lenient: true });
    // budget coerced; the invalid select is skipped (caller keeps its raw value), no throw.
    expect(out).toEqual({ budget: 1200 });
  });

  it("skips a missing required field in lenient mode (never drops the lead)", () => {
    expect(() => CustomFieldService.validateWith(defs, { budget: "5" }, { lenient: true })).not.toThrow();
    expect(CustomFieldService.validateWith(defs, { budget: "5" }, { lenient: true })).toEqual({ budget: 5 });
  });

  it("still throws in strict (default) mode", () => {
    expect(() => CustomFieldService.validateWith(defs, { tier: "Z" })).toThrow(/one of/);
  });
});
