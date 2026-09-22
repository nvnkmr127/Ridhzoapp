import { describe, it, expect, vi, beforeEach } from "vitest";
import { BillingLifecycleService } from "./lifecycleService";
import { PlatformConfigService } from "@/domains/platform/configService";

vi.mock("@/db", () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() } }));
vi.mock("@/domains/platform/configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));
vi.mock("@/domains/notifications/service", () => ({
  NotificationService: {
    notifyOrgAdmins: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/mail/mailer", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  appUrl: (p: string) => `https://app.ridhzo.com${p}`,
}));
vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("BillingLifecycleService.computeStatus", () => {
  it("returns 'free' for an org on free tier", () => {
    const { status, daysRemainingInGrace } = BillingLifecycleService.computeStatus(
      { plan: "free", planStatus: "active" },
      {}
    );
    expect(status).toBe("free");
    expect(daysRemainingInGrace).toBe(0);
  });

  it("returns 'paid' for an active paid subscription", () => {
    const { status, daysRemainingInGrace } = BillingLifecycleService.computeStatus(
      { plan: "pro", planStatus: "active" },
      {}
    );
    expect(status).toBe("paid");
    expect(daysRemainingInGrace).toBe(0);
  });

  it("returns 'pending' when subscription checkout was created but not yet charged", () => {
    const { status, daysRemainingInGrace } = BillingLifecycleService.computeStatus(
      { plan: "business", planStatus: "created" },
      {}
    );
    expect(status).toBe("pending");
    expect(daysRemainingInGrace).toBe(0);
  });

  it("returns 'grace_period' when payment failed but grace period is active", () => {
    const fourDaysFromNow = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const { status, daysRemainingInGrace } = BillingLifecycleService.computeStatus(
      { plan: "pro", planStatus: "halted" },
      { gracePeriodEndsAt: fourDaysFromNow, lastPaymentFailureAt: new Date().toISOString() }
    );
    expect(status).toBe("grace_period");
    expect(daysRemainingInGrace).toBe(4);
  });

  it("returns 'locked' when grace period has expired", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { status, daysRemainingInGrace } = BillingLifecycleService.computeStatus(
      { plan: "pro", planStatus: "halted" },
      { gracePeriodEndsAt: yesterday }
    );
    expect(status).toBe("locked");
    expect(daysRemainingInGrace).toBe(0);
  });

  it("returns 'paid' when manualPaidUntil override is active even if planStatus is halted", () => {
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { status } = BillingLifecycleService.computeStatus(
      { plan: "business", planStatus: "halted" },
      { manualPaidUntil: nextMonth }
    );
    expect(status).toBe("paid");
  });
});

describe("BillingLifecycleService.assertFeatureAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows access when tenant is paid or in grace period", async () => {
    vi.spyOn(BillingLifecycleService, "getTenantBillingStatus").mockResolvedValue({
      orgId: "org-1",
      orgName: "Acme",
      slug: "acme",
      plan: "pro",
      planStatus: "halted",
      status: "grace_period",
      gracePeriodEndsAt: new Date(Date.now() + 86400000).toISOString(),
      daysRemainingInGrace: 1,
      lastPaymentFailureAt: null,
      failureReason: null,
      failureCount: 1,
      dunningSentAt: null,
      manualPaidUntil: null,
      currentPeriodEnd: null,
      razorpaySubscriptionId: null,
    });

    await expect(BillingLifecycleService.assertFeatureAccess("org-1", "AI Copilot")).resolves.toBeUndefined();
  });

  it("locks feature access when tenant is delinquent and past grace period", async () => {
    vi.spyOn(BillingLifecycleService, "getTenantBillingStatus").mockResolvedValue({
      orgId: "org-2",
      orgName: "Delinquent Co",
      slug: "delinquent",
      plan: "pro",
      planStatus: "halted",
      status: "locked",
      gracePeriodEndsAt: new Date(Date.now() - 86400000).toISOString(),
      daysRemainingInGrace: 0,
      lastPaymentFailureAt: null,
      failureReason: "Card declined",
      failureCount: 2,
      dunningSentAt: null,
      manualPaidUntil: null,
      currentPeriodEnd: null,
      razorpaySubscriptionId: null,
    });

    await expect(BillingLifecycleService.assertFeatureAccess("org-2", "Sequences")).rejects.toThrow(
      /Feature "Sequences" is locked due to overdue subscription payment/
    );
  });
});

describe("BillingLifecycleService.handlePaymentSuccess dedup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("notifies admins the first time and records the timestamp", async () => {
    const { NotificationService } = await import("@/domains/notifications/service");
    (PlatformConfigService.get as any).mockResolvedValue({});

    await BillingLifecycleService.handlePaymentSuccess("org-1");

    expect(NotificationService.notifyOrgAdmins).toHaveBeenCalledTimes(1);
    const saved = (PlatformConfigService.set as any).mock.calls.at(-1)[1];
    expect(saved.lastPaymentSuccessNotifiedAt).toBeDefined();
  });

  it("does not notify again for the same payment within the dedup window", async () => {
    const { NotificationService } = await import("@/domains/notifications/service");
    // A success was already announced 1 minute ago (browser verify) — the webhook must stay silent.
    (PlatformConfigService.get as any).mockResolvedValue({
      lastPaymentSuccessNotifiedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    await BillingLifecycleService.handlePaymentSuccess("org-1");

    expect(NotificationService.notifyOrgAdmins).not.toHaveBeenCalled();
    // Grace flags are still cleared idempotently.
    const saved = (PlatformConfigService.set as any).mock.calls.at(-1)[1];
    expect(saved.gracePeriodEndsAt).toBeNull();
  });

  it("notifies again for a genuine renewal after the window has passed", async () => {
    const { NotificationService } = await import("@/domains/notifications/service");
    (PlatformConfigService.get as any).mockResolvedValue({
      lastPaymentSuccessNotifiedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await BillingLifecycleService.handlePaymentSuccess("org-1");

    expect(NotificationService.notifyOrgAdmins).toHaveBeenCalledTimes(1);
  });
});

describe("BillingLifecycleService manual overrides", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extendGracePeriod adds days to current grace", async () => {
    (PlatformConfigService.get as any).mockResolvedValue({});
    const updated = await BillingLifecycleService.extendGracePeriod("org-1", 7);
    expect(updated.gracePeriodEndsAt).toBeDefined();
    expect(PlatformConfigService.set).toHaveBeenCalled();
  });

  it("markManuallyPaid sets manualPaidUntil and clears failure", async () => {
    (PlatformConfigService.get as any).mockResolvedValue({
      gracePeriodEndsAt: "old-date",
      failureReason: "old-failure",
    });
    const updated = await BillingLifecycleService.markManuallyPaid("org-1", 30);
    expect(updated.manualPaidUntil).toBeDefined();
    expect(updated.gracePeriodEndsAt).toBeNull();
    expect(updated.failureReason).toBeNull();
  });
});

describe("BillingLifecycleService.handlePaymentFailure auto-downgrade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first failure initiates 7-day grace period and increments failureCount to 1", async () => {
    const { db } = await import("@/db");
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "org-1", name: "Acme", plan: "starter" }]),
        }),
      }),
    });
    (PlatformConfigService.get as any).mockResolvedValue({ failureCount: 0 });

    await BillingLifecycleService.handlePaymentFailure("org-1", "Card expired");

    const saved = (PlatformConfigService.set as any).mock.calls.at(-1)[1];
    expect(saved.failureCount).toBe(1);
    expect(saved.gracePeriodEndsAt).toBeDefined();
  });

  it("second failure automatically downgrades to Free and halts subscription", async () => {
    const { db } = await import("@/db");
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "org-1", name: "Acme", plan: "starter" }]),
        }),
      }),
    });
    (db.update as any).mockReturnValue({ set: setMock });
    (PlatformConfigService.get as any).mockResolvedValue({ failureCount: 1 });

    await BillingLifecycleService.handlePaymentFailure("org-1", "Insufficient funds");

    expect(db.update).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "free",
        planStatus: "halted",
      })
    );

    const saved = (PlatformConfigService.set as any).mock.calls.at(-1)[1];
    expect(saved.failureCount).toBe(2);
    expect(saved.gracePeriodEndsAt).toBeNull();
  });
});

