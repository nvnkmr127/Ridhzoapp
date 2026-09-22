import { describe, it, expect } from "vitest";
import { resolveFormFields, sanitizeFields, slugifyKey, buildSubmission, groupIntoSteps, DEFAULT_FORM_FIELDS } from "./formFields";

describe("resolveFormFields", () => {
  it("returns the default schema when none is configured", () => {
    expect(resolveFormFields(null)).toEqual(DEFAULT_FORM_FIELDS);
    expect(resolveFormFields({})).toEqual(DEFAULT_FORM_FIELDS);
  });
  it("returns the saved schema when present", () => {
    const cfg = { formFields: [{ key: "email", label: "Work email", type: "email", required: true, step: 2 }] };
    expect(resolveFormFields(cfg)).toEqual([{ key: "email", label: "Work email", type: "email", required: true, step: 2 }]);
  });
});

describe("sanitizeFields", () => {
  it("drops junk, dedupes keys, and derives custom keys from labels", () => {
    const out = sanitizeFields([
      { label: "Full Name", type: "text" },
      { label: "Full Name", type: "text" }, // dupe key -> dropped
      { label: "Budget!", type: "number", required: true },
      { nope: 1 },
    ]);
    expect(out).toEqual([
      { key: "full_name", label: "Full Name", type: "text", required: false, step: 1 },
      { key: "budget", label: "Budget!", type: "number", required: true, step: 1 },
    ]);
  });
  it("preserves standard keys and falls back to text for bad types", () => {
    const out = sanitizeFields([{ key: "phone", label: "Mobile", type: "bogus" }]);
    expect(out[0]).toEqual({ key: "phone", label: "Mobile", type: "text", required: false, step: 1 });
  });
  it("defaults and clamps the step number", () => {
    expect(sanitizeFields([{ label: "A" }])[0].step).toBe(1);
    expect(sanitizeFields([{ label: "B", step: 3 }])[0].step).toBe(3);
    expect(sanitizeFields([{ label: "C", step: 0 }])[0].step).toBe(1);
    expect(sanitizeFields([{ label: "D", step: 999 }])[0].step).toBe(10);
  });
});

describe("groupIntoSteps", () => {
  it("groups fields by step in order, collapsing empty step numbers", () => {
    const fields = sanitizeFields([
      { label: "A", step: 1 },
      { label: "B", step: 3 },
      { label: "C", step: 1 },
    ]);
    const steps = groupIntoSteps(fields);
    expect(steps.length).toBe(2);
    expect(steps[0].map((f) => f.label)).toEqual(["A", "C"]);
    expect(steps[1].map((f) => f.label)).toEqual(["B"]);
  });
  it("default fields are a single step", () => {
    expect(groupIntoSteps(DEFAULT_FORM_FIELDS).length).toBe(1);
  });
});

describe("slugifyKey", () => {
  it("makes a safe key", () => {
    expect(slugifyKey("What is your budget?")).toBe("what_is_your_budget");
    expect(slugifyKey("   ")).toBe("field");
  });
});

describe("buildSubmission", () => {
  const fields = resolveFormFields(null); // name/email/phone/message

  it("rejects when no email or phone", () => {
    const r = buildSubmission(fields, { name: "Ada" });
    expect(r.ok).toBe(false);
  });
  it("rejects a required field left blank", () => {
    const req = [{ key: "company", label: "Company", type: "text" as const, required: true, step: 1 }, ...fields];
    const r = buildSubmission(req, { name: "Ada", email: "a@b.com" });
    expect(r).toEqual({ ok: false, error: "Company is required." });
  });
  it("accepts a valid select option and rejects an invalid one", () => {
    const withSelect = [
      { key: "tier", label: "Tier", type: "select" as const, required: false, step: 1, options: ["A", "B"] },
      ...fields,
    ];
    const good = buildSubmission(withSelect, { name: "Ada", tier: "A", email: "a@b.com" });
    expect(good.ok).toBe(true);
    expect(good.ok && good.values.tier).toBe("A");
    const bad = buildSubmission(withSelect, { name: "Ada", tier: "Z", email: "a@b.com" });
    expect(bad.ok).toBe(false);
  });
  it("keeps select options through sanitize and drops them for non-select types", () => {
    const [sel] = sanitizeFields([{ label: "Tier", type: "select", options: [" A ", "", "B"] }]);
    expect(sel.options).toEqual(["A", "B"]);
    const [txt] = sanitizeFields([{ label: "Name", type: "text", options: ["x"] }]);
    expect(txt.options).toBeUndefined();
  });
  it("rejects a malformed email", () => {
    expect(buildSubmission(fields, { email: "nope" }).ok).toBe(false);
  });
  it("keeps only provided values, trimmed", () => {
    const r = buildSubmission(fields, { name: "  Ada  ", email: "a@b.com", phone: "" });
    expect(r).toEqual({ ok: true, values: { name: "Ada", email: "a@b.com" } });
  });
});
