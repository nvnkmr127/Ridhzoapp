import { describe, it, expect } from "vitest";
import { cleanPlaybooks, PLAYBOOK_MAX_CHARS } from "./statusPlaybooks";

describe("cleanPlaybooks", () => {
  it("keeps trimmed text for real statuses and drops blanks, unknown keys and junk", () => {
    expect(cleanPlaybooks({ new: "  Call within 5 min ", site_visit: "   ", ghost: "x", bad: 5 }, ["new", "site_visit"])).toEqual({ new: "Call within 5 min" });
  });

  it("caps each playbook's length and ignores non-objects", () => {
    expect(cleanPlaybooks({ new: "a".repeat(PLAYBOOK_MAX_CHARS + 50) }).new).toHaveLength(PLAYBOOK_MAX_CHARS);
    expect(cleanPlaybooks(null)).toEqual({});
    expect(cleanPlaybooks(["x"])).toEqual({});
  });
});
