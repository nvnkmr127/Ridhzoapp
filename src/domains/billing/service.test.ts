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
vi.mock("@/lib/billing/razorpay", () => ({
  isConfigured: vi.fn(),
  cancelSubscription: vi.fn().mockResolvedValue({}),
  fetchSubscription: vi.fn(),
  planForPlanId: (id: string) => (id === "plan_starter" ? "starter" : id === "plan_unlimited" ? "unlimited" : null),
}));
vi.mock("./lifecycleService", () => ({ BillingLifecycleService: { handlePaymentSuccess: vi.fn(), handlePaymentFailure: vi.fn() } }));

import { BillingService } from "./service";
import * as razorpay from "@/lib/billing/razorpay";

const log = AuditService.log as unknown as ReturnType<typeof vi.fn>;

describe("BillingService.handleWebhook audit — A7", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a system-attributed billing.plan_changed with old and new plan/status", async () => {
    selectLimit.mockResolvedValue([{ id: "org-1", plan: "pro", planStatus: "active", subscriptionId: "sub_123" }]);

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
    selectLimit.mockResolvedValue([{ id: "org-1", plan: "free", planStatus: "created", subscriptionId: "sub_123" }]);
    await BillingService.handleWebhook("subscription.activated", { id: "sub_123" });
    expect(log).toHaveBeenCalledWith(expect.not.objectContaining({ userId: expect.anything() }));
  });
});

describe("BillingService — money safety", () => {
  const fetchSub = razorpay.fetchSubscription as unknown as ReturnType<typeof vi.fn>;
  const cancelSub = razorpay.cancelSubscription as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => vi.clearAllMocks());

  it("never downgrades when a REPLACED subscription is cancelled", async () => {
    // Found via notes, but the org has since moved to sub_new.
    selectLimit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "org-1", plan: "unlimited", planStatus: "active", subscriptionId: "sub_new" }]);
    await BillingService.handleWebhook("subscription.cancelled", { id: "sub_old", notes: { organizationId: "org-1" } });
    expect(updateWhere).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("takes the plan from Razorpay, not the browser, and cancels the subscription it replaces", async () => {
    fetchSub.mockResolvedValue({ id: "sub_new", plan_id: "plan_starter", status: "active", notes: { organizationId: "org-1" } });
    selectLimit.mockResolvedValue([{ plan: "starter", subscriptionId: "sub_old" }]);
    const res = await BillingService.activate("org-1", "sub_new");
    expect(res.plan).toBe("starter");
    expect(cancelSub).toHaveBeenCalledWith("sub_old", false);
  });

  it("a downgrade booked for later keeps the paid plan and lets the old one run out", async () => {
    const future = Math.floor(Date.now() / 1000) + 10 * 86400;
    fetchSub.mockResolvedValue({ id: "sub_new", plan_id: "plan_starter", status: "authenticated", start_at: future, notes: { organizationId: "org-1" } });
    selectLimit.mockResolvedValue([{ plan: "unlimited", planStatus: "active", subscriptionId: "sub_old", trialEndsAt: null }]);
    const res = await BillingService.activate("org-1", "sub_new");
    expect(res.scheduled).toBe(true);
    expect(cancelSub).toHaveBeenCalledWith("sub_old", true);
  });

  it("refuses another workspace's subscription", async () => {
    fetchSub.mockResolvedValue({ id: "sub_x", plan_id: "plan_unlimited", status: "active", notes: { organizationId: "org-2" } });
    await expect(BillingService.activate("org-1", "sub_x")).rejects.toThrow(/another workspace/);
  });

  it("refuses an unpaid subscription", async () => {
    fetchSub.mockResolvedValue({ id: "sub_x", plan_id: "plan_starter", status: "created", notes: { organizationId: "org-1" } });
    await expect(BillingService.activate("org-1", "sub_x")).rejects.toThrow(/hasn't gone through/);
  });
});

describe("BillingService.firstChargeDate — nobody pays twice", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  const end = new Date("2026-10-20T00:00:00Z");
  const paid = (plan: string) => ({ plan, planStatus: "active", trialEndsAt: null, currentPeriodEnd: end });

  it("mid-trial: first charge when the trial ends", () => {
    const trialEnd = new Date("2026-10-10T00:00:00Z");
    expect(BillingService.firstChargeDate({ plan: "starter", planStatus: "active", trialEndsAt: trialEnd }, "starter", now)).toEqual(trialEnd);
  });

  it("downgrade or same plan (resubscribe / other billing period): at the end of the paid period", () => {
    expect(BillingService.firstChargeDate(paid("unlimited"), "starter", now)).toEqual(end);
    expect(BillingService.firstChargeDate(paid("starter"), "starter", now)).toEqual(end);
    expect(BillingService.firstChargeDate(paid("business"), "starter", now)).toEqual(end); // legacy name
  });

  it("upgrade, free, or a failed payment: charge now", () => {
    expect(BillingService.firstChargeDate(paid("starter"), "unlimited", now)).toBeNull();
    expect(BillingService.firstChargeDate({ plan: "free", planStatus: "active" }, "starter", now)).toBeNull();
    expect(BillingService.firstChargeDate({ ...paid("starter"), planStatus: "halted" }, "starter", now)).toBeNull();
  });
});
