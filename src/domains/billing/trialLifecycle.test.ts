import { describe, it, expect, vi, beforeEach } from "vitest";
import { BillingLifecycleService } from "./lifecycleService";
import { PlatformService } from "@/domains/platform/service";
import { db } from "@/db";
import { sendEmail } from "@/lib/mail/mailer";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/jobs/redis", () => ({
  redisConfigured: false,
}));

vi.mock("@/lib/mail/mailer", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  appUrl: (p: string) => `https://app.test${p}`,
}));

vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/domains/platform/opsAlertService", () => ({
  OpsAlertService: {
    dispatchAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Trial Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeStatus with trial", () => {
    it("returns 'trial' when trialEndsAt is in the future", () => {
      const futureTrial = new Date(Date.now() + 7 * 86_400_000);
      const res = BillingLifecycleService.computeStatus(
        { plan: "pro", planStatus: "active", trialEndsAt: futureTrial },
        {}
      );
      expect(res.status).toBe("trial");
      expect(res.daysRemainingInGrace).toBe(0);
    });

    it("returns 'free' for free plan even if old trialEndsAt is present", () => {
      const pastTrial = new Date(Date.now() - 86_400_000);
      const res = BillingLifecycleService.computeStatus(
        { plan: "free", planStatus: "active", trialEndsAt: pastTrial },
        {}
      );
      expect(res.status).toBe("free");
    });
  });

  describe("PlatformService.setPlan with trial window", () => {
    function mockDb(returned: Record<string, unknown>) {
      // setPlan first looks up any Razorpay subscription to cancel.
      vi.mocked(db.select).mockReturnValue({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([{ subscriptionId: null }]) }) }),
      } as any);
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: "org_1", ...returned }]),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdate as any);
      return mockUpdate;
    }

    it("sets trialEndsAt when trialDays is provided (a trial is not complimentary)", async () => {
      const mockUpdate = mockDb({ plan: "starter", trialEndsAt: new Date(Date.now() + 14 * 86_400_000) });
      const res = await PlatformService.setPlan("org_1", "starter", 14);
      expect(res?.plan).toBe("starter");
      expect(res?.trialEndsAt).toBeDefined();
      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "starter", trialEndsAt: expect.any(Date), complimentary: 0 })
      );
    });

    it("a paid plan with no trial is a free-for-client grant, optionally until a date", async () => {
      const mockUpdate = mockDb({ plan: "starter", trialEndsAt: null });
      await PlatformService.setPlan("org_1", "starter", null, { months: 6, note: "Agency client" });
      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "starter",
          trialEndsAt: null,
          complimentary: 1,
          complimentaryUntil: expect.any(Date),
          complimentaryNote: "Agency client",
          razorpaySubscriptionId: null,
        })
      );
    });

    it("moving to free clears the grant", async () => {
      const mockUpdate = mockDb({ plan: "free", trialEndsAt: null });
      await PlatformService.setPlan("org_1", "free");
      expect(mockUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ plan: "free", complimentary: 0, complimentaryUntil: null }));
    });
  });

  describe("BillingLifecycleService.downgradeExpiredTrials", () => {
    it("downgrades expired trials to free and notifies owner", async () => {
      const expiredDate = new Date(Date.now() - 2 * 86_400_000);
      let selectCallCount = 0;

      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              if (selectCallCount === 1) {
                // Expired trials query
                return Promise.resolve([
                  {
                    id: "org_trial_1",
                    name: "Acme Trial",
                    slug: "acme-trial",
                    plan: "pro",
                    trialEndsAt: expiredDate,
                    razorpaySubscriptionId: null,
                  },
                ]);
              }
              // Owner query
              return {
                limit: vi.fn().mockResolvedValue([{ email: "owner@acme.com", firstName: "Acme Owner" }]),
              };
            }),
          }),
        } as any;
      });

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(db.update).mockReturnValue(mockUpdate as any);

      const result = await BillingLifecycleService.downgradeExpiredTrials();

      expect(result.downgradedCount).toBe(1);
      expect(result.downgradedOrgs[0].name).toBe("Acme Trial");
      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "free",
          trialEndsAt: null,
        })
      );
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "owner@acme.com",
          subject: expect.stringContaining("trial for Acme Trial has ended"),
        })
      );
    });
  });
});
