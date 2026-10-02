import { describe, it, expect } from "vitest";
import { requiredScope } from "./apiScopes";

describe("requiredScope", () => {
  it("maps areas and read/write", () => {
    expect(requiredScope("/api/v1/leads", "GET")).toBe("leads:read");
    expect(requiredScope("/api/v1/leads/abc/notes", "POST")).toBe("leads:write");
    expect(requiredScope("/api/v1/meetings/1", "PATCH")).toBe("meetings:write");
    expect(requiredScope("/api/v1/follow-ups", "GET")).toBe("followups:read");
  });
  it("leaves unscoped areas alone", () => {
    expect(requiredScope("/api/v1/me", "GET")).toBeNull();
    expect(requiredScope("/api/v1/statuses", "GET")).toBeNull();
  });
});
