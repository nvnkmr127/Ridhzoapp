import { describe, it, expect } from "vitest";
import { shouldShowBroadcast, type BroadcastConfig } from "./configService";

describe("shouldShowBroadcast audience filtering", () => {
  const baseActiveBroadcast: BroadcastConfig = {
    message: "WhatsApp API degraded for Business users",
    active: true,
    level: "warning",
  };

  it("returns false if broadcast is null, undefined, or inactive", () => {
    expect(shouldShowBroadcast(null, { id: "org-1", plan: "business" })).toBe(false);
    expect(shouldShowBroadcast(undefined, { id: "org-1", plan: "business" })).toBe(false);
    expect(
      shouldShowBroadcast({ ...baseActiveBroadcast, active: false }, { id: "org-1", plan: "business" })
    ).toBe(false);
    expect(
      shouldShowBroadcast({ ...baseActiveBroadcast, message: "   " }, { id: "org-1", plan: "business" })
    ).toBe(false);
  });

  it("shows global broadcast (no targeting or 'all') to any tenant", () => {
    expect(shouldShowBroadcast(baseActiveBroadcast, { id: "org-1", plan: "free" })).toBe(true);
    expect(shouldShowBroadcast(baseActiveBroadcast, { id: "org-2", plan: "pro" })).toBe(true);
    expect(shouldShowBroadcast(baseActiveBroadcast, { id: "org-3", plan: "business" })).toBe(true);
    expect(
      shouldShowBroadcast({ ...baseActiveBroadcast, targetPlan: "all" }, { id: "org-1", plan: "free" })
    ).toBe(true);
  });

  it("filters broadcasts by targetPlan", () => {
    const businessBroadcast: BroadcastConfig = {
      ...baseActiveBroadcast,
      targetPlan: "business",
    };

    // Business tenant sees it
    expect(shouldShowBroadcast(businessBroadcast, { id: "org-biz", plan: "business" })).toBe(true);

    // Free and Pro tenants do NOT see it
    expect(shouldShowBroadcast(businessBroadcast, { id: "org-free", plan: "free" })).toBe(false);
    expect(shouldShowBroadcast(businessBroadcast, { id: "org-pro", plan: "pro" })).toBe(false);

    // Unauthenticated/no org does not see plan-targeted broadcast
    expect(shouldShowBroadcast(businessBroadcast, null)).toBe(false);
  });

  it("filters broadcasts by single tenant targetOrgId", () => {
    const singleTenantBroadcast: BroadcastConfig = {
      ...baseActiveBroadcast,
      targetOrgId: "org-sharma-123",
    };

    // Targeted tenant sees it
    expect(shouldShowBroadcast(singleTenantBroadcast, { id: "org-sharma-123", plan: "pro" })).toBe(true);

    // Other tenants do NOT see it
    expect(shouldShowBroadcast(singleTenantBroadcast, { id: "org-other-456", plan: "pro" })).toBe(false);
    expect(shouldShowBroadcast(singleTenantBroadcast, null)).toBe(false);
  });

  it("enforces both targetPlan and targetOrgId when both are specified", () => {
    const comboBroadcast: BroadcastConfig = {
      ...baseActiveBroadcast,
      targetPlan: "business",
      targetOrgId: "org-sharma-123",
    };

    // Matches both
    expect(shouldShowBroadcast(comboBroadcast, { id: "org-sharma-123", plan: "business" })).toBe(true);

    // Matches org but not plan
    expect(shouldShowBroadcast(comboBroadcast, { id: "org-sharma-123", plan: "pro" })).toBe(false);

    // Matches plan but not org
    expect(shouldShowBroadcast(comboBroadcast, { id: "org-other-456", plan: "business" })).toBe(false);
  });
});
