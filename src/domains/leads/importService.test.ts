import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { CustomFieldService } from "@/domains/customFields/service";
import { LeadImportService, getImportFields } from "./importService";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

// Keep the real validateWith/FieldValidationError; only stub the DB-backed list() per test.
const listSpy = vi.spyOn(CustomFieldService, "list");

// analyze() reads existing leads once (for dup detection) then validates each row against the defs.
function mockExistingLeads(rows: { email?: string | null; phone?: string | null }[]) {
  (db.select as any).mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
}

const priorityField = {
  key: "priority", label: "Priority", type: "select", options: ["High", "Low"],
  required: true, disabled: false, adminOnly: false,
} as any;

describe("LeadImportService.analyze — custom fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingLeads([]);
  });

  it("validates, coerces, and stores custom-field values", async () => {
    listSpy.mockResolvedValue([
      priorityField,
      { key: "budget", label: "Budget", type: "number", options: [], required: false, disabled: false, adminOnly: false },
    ]);

    const res = await LeadImportService.analyze("org-1", [
      { name: "Alice", customData: { priority: "High", budget: "1,200" } },
    ]);

    expect(res.rows[0].valid).toBe(true);
    expect(res.rows[0].cleanedCustomData).toEqual({ priority: "High", budget: 1200 });
  });

  it("flags a row whose required custom field is missing", async () => {
    listSpy.mockResolvedValue([priorityField]);

    const res = await LeadImportService.analyze("org-1", [{ name: "Bob", customData: {} }]);

    expect(res.rows[0].valid).toBe(false);
    expect(res.rows[0].reason).toMatch(/Priority/);
    expect(res.errorCount).toBe(1);
  });

  it("flags a row whose custom value is not an allowed option", async () => {
    listSpy.mockResolvedValue([priorityField]);

    const res = await LeadImportService.analyze("org-1", [
      { name: "Cara", customData: { priority: "Urgent" } },
    ]);

    expect(res.rows[0].valid).toBe(false);
    expect(res.rows[0].reason).toMatch(/one of: High, Low/);
  });
});

describe("getImportFields", () => {
  it("appends active custom fields and hides disabled + admin-only (for non-admins)", async () => {
    listSpy.mockResolvedValue([
      { key: "priority", label: "Priority", required: true, disabled: false, adminOnly: false },
      { key: "secret", label: "Secret", required: false, disabled: false, adminOnly: true },
      { key: "gone", label: "Gone", required: false, disabled: true, adminOnly: false },
    ] as any);

    const fields = await getImportFields("org-1", false);
    const keys = fields.map((f) => f.key);

    expect(keys).toContain("name"); // fixed field
    expect(keys).toContain("priority");
    expect(keys).not.toContain("secret"); // admin-only hidden from non-admin
    expect(keys).not.toContain("gone"); // disabled hidden
    expect(fields.find((f) => f.key === "priority")?.custom).toBe(true);
  });
});
