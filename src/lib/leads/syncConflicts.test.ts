import { describe, expect, it } from "vitest";
import { leadConflicts } from "./syncConflicts";

describe("leadConflicts", () => {
  const server = { name: "Ravi", phone: "+919800000002", customData: { budget: "5L", source: "fb" } };

  it("merges edits to fields nobody else touched", () => {
    expect(leadConflicts(server, { name: "Ravi K" }, { name: "Ravi" })).toEqual([]);
  });

  it("flags a field changed on the server since the phone's copy", () => {
    expect(leadConflicts(server, { phone: "+919800000003" }, { phone: "+919800000001" })).toEqual([
      { field: "phone", server: "+919800000002" },
    ]);
  });

  it("is not a conflict when both sides made the same change (e.g. a replayed request)", () => {
    expect(leadConflicts(server, { phone: "+919800000002" }, { phone: "+919800000001" })).toEqual([]);
  });

  it("checks customData-backed fields and custom keys; empty values are equal", () => {
    expect(leadConflicts(server, { budget: "6L", customData: { source: "web" } }, { budget: "4L", customData: { source: "" } })).toEqual([
      { field: "budget", server: "5L" },
      { field: "customData.source", server: "fb" },
    ]);
    expect(leadConflicts({ name: "A", email: null }, { email: "a@x.io" }, { email: "" })).toEqual([]);
  });
});
