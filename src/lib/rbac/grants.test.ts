import { describe, it, expect } from "vitest";
import { roleGrants } from "./grants";

describe("roleGrants (who counts as a recipient for billing / settings mail)", () => {
  it("system admin holds everything", () => {
    expect(roleGrants({ name: "admin", permissions: [], organizationId: null }, "billing.manage")).toBe(true);
  });
  it("a custom role holds only what it lists", () => {
    const accounts = { name: "Accounts", permissions: ["billing.manage"], organizationId: "org1" };
    expect(roleGrants(accounts, "billing.manage")).toBe(true);
    expect(roleGrants(accounts, "settings.manage")).toBe(false);
  });
  it("a plain Member gets neither", () => {
    const member = { name: "member", permissions: [], organizationId: null };
    expect(roleGrants(member, "billing.manage")).toBe(false);
    expect(roleGrants(member, "settings.manage")).toBe(false);
  });
  it("a tenant role merely NAMED admin gets nothing extra", () => {
    expect(roleGrants({ name: "admin", permissions: [], organizationId: "org1" }, "billing.manage")).toBe(false);
  });
});
