import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "@/domains/audit/service";

const selectLimit = vi.fn();
const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
  },
}));
vi.mock("@/domains/audit/service", () => ({ AuditService: { log: vi.fn() } }));
vi.mock("@/lib/billing/razorpay", () => ({ isConfigured: vi.fn(), cancelSubscription: vi.fn() }));

import { BillingService } from "./service";

const log = AuditService.log as unknown as ReturnType<typeof vi.fn>;

describe("BillingService.handleWebhook audit — A7", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a system-attributed billing.plan_changed with old and new plan/status", async () => {
    selectLimit.mockResolvedValue([{ id: "org-1", plan: "pro", planStatus: "active" }]);

    await BillingService.handleWebhook("subscription.cancelled", { id: "sub_123" });

    expect(log).toHaveBeenCalledWith({
      organizationId: "org-1",
      action: "billing.plan_changed",
      entityType: "organization",
      entityId: "org-1",
      metadata: { event: "subscription.cancelled", subscriptionId: "sub_123", oldPlan: "pro", newPlan: "free", oldStatus: "active", newStatus: "cancelled" },
    });
  });

  it("does not log for an unknown organization", async () => {
    selectLimit.mockResolvedValue([]);
    await BillingService.handleWebhook("subscription.activated", { id: "sub_unknown" });
    expect(log).not.toHaveBeenCalled();
  });

  it("does not log for an event type it doesn't handle", async () => {
    selectLimit.mockResolvedValue([{ id: "org-1", plan: "free", planStatus: "cancelled" }]);
    await BillingService.handleWebhook("subscription.updated", { id: "sub_123" });
    expect(log).not.toHaveBeenCalled();
  });

  it("attributes no user — this is the only path that can change billing state with nobody in the loop", async () => {
    selectLimit.mockResolvedValue([{ id: "org-1", plan: "free", planStatus: "created" }]);
    await BillingService.handleWebhook("subscription.activated", { id: "sub_123" });
    expect(log).toHaveBeenCalledWith(expect.not.objectContaining({ userId: expect.anything() }));
  });
});
