import { describe, it, expect, vi, beforeEach } from "vitest";
import { CustomFieldService } from "./service";
import { db } from "@/db";

vi.mock("@/db", () => ({ db: { select: vi.fn(), transaction: vi.fn() } }));

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

describe("settings changes don't lock existing leads", () => {
  const defs = [
    { key: "tier", label: "Tier", type: "select", required: false, options: ["A", "B"], disabled: false, adminOnly: false },
    { key: "city", label: "City", type: "text", required: true, options: [], disabled: false, adminOnly: false },
    { key: "size", label: "Size", type: "number", required: false, options: [], disabled: false, adminOnly: false, defaultValue: "10" },
  ] as any;

  it("keeps an unchanged value whose option was removed, and an unfilled field made required later", () => {
    const existing = { tier: "Z", size: 5 };
    expect(CustomFieldService.validateWith(defs, { tier: "Z", city: "", size: "5" }, { existing })).toEqual({ tier: "Z", size: 5 });
  });

  it("still validates a value the user changed", () => {
    expect(() => CustomFieldService.validateWith(defs, { tier: "Y", city: "x" }, { existing: { tier: "Z" } })).toThrow(/one of/);
  });

  it("applies defaults to new leads only", () => {
    expect(CustomFieldService.validateWith(defs, { city: "Pune" }, { isNew: true })).toEqual({ city: "Pune", size: 10 });
    expect(CustomFieldService.validateWith(defs, { city: "Pune" })).toEqual({ city: "Pune" });
  });
});

describe("field definition checks", () => {
  it("rejects a default the field wouldn't accept", async () => {
    await expect(CustomFieldService.create("org", { label: "Budget", type: "number", defaultValue: "abc" })).rejects.toThrow(/Default value: Budget must be a number/);
    await expect(CustomFieldService.create("org", { label: "Tier", type: "select", options: ["A"], defaultValue: "B" })).rejects.toThrow(/Default value/);
  });

  it("requires at least one option and no commas for choice fields", async () => {
    await expect(CustomFieldService.create("org", { label: "Tier", type: "select", options: [" ", ""] })).rejects.toThrow(/at least one option/);
    await expect(CustomFieldService.create("org", { label: "Tier", type: "multiselect", options: ["a,b"] })).rejects.toThrow(/commas/);
  });

  it("delete clears the key from leads so a new field can't inherit old values", async () => {
    const calls: string[] = [];
    const tx = {
      delete: () => ({ where: () => ({ returning: async () => { calls.push("delete"); return [{ key: "budget" }]; } }) }),
      update: () => ({ set: (v: any) => ({ where: async () => { calls.push(`clear:${v.customData ? "yes" : "no"}`); } }) }),
    };
    (db.transaction as any).mockImplementation((fn: any) => fn(tx));
    expect(await CustomFieldService.remove("org", "id")).toBe(true);
    expect(calls).toEqual(["delete", "clear:yes"]);
  });
});
