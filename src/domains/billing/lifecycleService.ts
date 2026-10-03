import { isPlaceholderEmail } from "@/lib/auth/googleLink";
import { keepAlive } from "@/lib/keepAlive";
import { trialExpired, canonicalPlan, PLAN_MONTHLY_PRICE } from "./planNames";
import { db } from "@/db";
import { PLAN_LIMITS } from "./planService";
import { organizations, users, roles } from "@/db/schema";
import { eq, desc, and, isNotNull, lte, ne, sql } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";
import { NotificationService } from "@/domains/notifications/service";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { mh, mp, mbtn, mfine, mcallout, mtag, mfacts, mcompare } from "@/lib/mail/layout";
import { AuditService } from "@/domains/audit/service";
import { escapeHtml as esc } from "@/lib/utils";
import { recipientsWithPermission } from "@/lib/mail/recipients";

export type BillingStatus = "paid" | "pending" | "grace_period" | "locked" | "free" | "trial" | "complimentary";

export interface TenantBillingLifecycle {
  gracePeriodEndsAt?: string | null;
  lastPaymentFailureAt?: string | null;
  failureReason?: string | null;
  failureCount?: number;
  dunningSentAt?: string | null;
  manualPaidUntil?: string | null;
  // When we last told admins "payment successful". One payment fans out to several success signals
  // (browser verify + Razorpay `activated`/`charged` + retries), so we suppress repeats within a
  // short window to avoid duplicate bell/push notifications for the same payment.
  lastPaymentSuccessNotifiedAt?: string | null;
  // Meta "Subscribe" is a conversion: report it once per workspace, not on every monthly renewal.
  capiSubscribeSentAt?: string | null;
  // One-shot email guards for renewal reminders / usage alerts: key → ISO time sent (see billingEmails.ts).
  emailsSent?: Record<string, string>;
}

// A single payment produces multiple success calls seconds/minutes apart; real renewals are ~monthly.
// ponytail: fixed dedup window, key on subscription period instead if sub-window renewals ever exist.
const PAYMENT_SUCCESS_NOTIFY_DEDUP_MS = 15 * 60 * 1000;

export interface TenantBillingInfo {
  orgId: string;
  orgName: string;
  slug: string;
  plan: string;
  planStatus: string;
  status: BillingStatus;
  gracePeriodEndsAt: string | null;
  daysRemainingInGrace: number;
  lastPaymentFailureAt: string | null;
  failureReason: string | null;
  failureCount: number;
  dunningSentAt: string | null;
  manualPaidUntil: string | null;
  currentPeriodEnd: string | null;
  razorpaySubscriptionId: string | null;
  trialEndsAt?: string | null;
}

const DEFAULT_GRACE_DAYS = 7;

export class BillingLifecycleService {
  private static configKey(orgId: string) {
    return `billing_lifecycle:${orgId}`;
  }

  static async getLifecycle(orgId: string): Promise<TenantBillingLifecycle> {
    return PlatformConfigService.get<TenantBillingLifecycle>(this.configKey(orgId), {});
  }

  static async setLifecycle(orgId: string, lifecycle: TenantBillingLifecycle): Promise<void> {
    await PlatformConfigService.set(this.configKey(orgId), lifecycle);
  }

  static computeStatus(
    org: { plan?: string | null; planStatus?: string | null; trialEndsAt?: Date | string | null; complimentary?: number | null },
    lifecycle: TenantBillingLifecycle
  ): { status: BillingStatus; daysRemainingInGrace: number } {
    const now = Date.now();

    // 1. Manual offline override check
    if (lifecycle.manualPaidUntil && new Date(lifecycle.manualPaidUntil).getTime() > now) {
      return { status: "paid", daysRemainingInGrace: 0 };
    }

    const plan = org.plan ?? "free";
    // An ended trial is Free now, even before the hourly worker downgrades the row (planStatus is
    // still "active" from signup, so it would otherwise fall through to "paid" below).
    if (plan === "free" || trialExpired(org, now)) {
      return { status: "free", daysRemainingInGrace: 0 };
    }

    // Paid plan handed out free by an admin: not a payer, and never delinquent.
    if (org.complimentary === 1) return { status: "complimentary", daysRemainingInGrace: 0 };

    // 2. Active trial window
    if (org.trialEndsAt && new Date(org.trialEndsAt).getTime() > now) {
      return { status: "trial", daysRemainingInGrace: 0 };
    }

    const planStatus = org.planStatus ?? "active";

    // 3. Active paid subscription
    if (planStatus === "active") {
      return { status: "paid", daysRemainingInGrace: 0 };
    }

    // 4. Checkout initiated but not yet charged
    if (planStatus === "created") {
      return { status: "pending", daysRemainingInGrace: 0 };
    }

    // A customer who cancelled is simply gone, not delinquent.
    if (planStatus === "cancelled") return { status: "free", daysRemainingInGrace: 0 };

    // 5. Halted or failed payment: check grace period
    if (lifecycle.gracePeriodEndsAt) {
      const graceEnd = new Date(lifecycle.gracePeriodEndsAt).getTime();
      if (graceEnd > now) {
        const daysRemaining = Math.max(1, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)));
        return { status: "grace_period", daysRemainingInGrace: daysRemaining };
      }
    }

    // Past grace period or no grace granted -> locked/delinquent
    return { status: "locked", daysRemainingInGrace: 0 };
  }

  static async getTenantBillingStatus(orgId: string): Promise<TenantBillingInfo | null> {
    // Independent reads — run them together so this (called by the grace banner on every page) costs
    // one DB round-trip, not two, on the remote database.
    const [[org], lifecycle] = await Promise.all([
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          plan: organizations.plan,
          planStatus: organizations.planStatus,
          currentPeriodEnd: organizations.currentPeriodEnd,
          razorpaySubscriptionId: organizations.razorpaySubscriptionId,
          trialEndsAt: organizations.trialEndsAt,
          complimentary: organizations.complimentary,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1),
      this.getLifecycle(orgId),
    ]);

    if (!org) return null;

    const { status, daysRemainingInGrace } = this.computeStatus(org, lifecycle);

    return {
      orgId: org.id,
      orgName: org.name,
      slug: org.slug,
      plan: org.plan ?? "free",
      planStatus: org.planStatus ?? "active",
      status,
      gracePeriodEndsAt: lifecycle.gracePeriodEndsAt ?? null,
      daysRemainingInGrace,
      lastPaymentFailureAt: lifecycle.lastPaymentFailureAt ?? null,
      failureReason: lifecycle.failureReason ?? null,
      failureCount: lifecycle.failureCount ?? 0,
      dunningSentAt: lifecycle.dunningSentAt ?? null,
      manualPaidUntil: lifecycle.manualPaidUntil ?? null,
      currentPeriodEnd: org.currentPeriodEnd ? new Date(org.currentPeriodEnd).toISOString() : null,
      razorpaySubscriptionId: org.razorpaySubscriptionId ?? null,
      trialEndsAt: org.trialEndsAt ? new Date(org.trialEndsAt).toISOString() : null,
    };
  }

  static async handlePaymentFailure(orgId: string, reason = "Subscription payment failed"): Promise<void> {
    try {
      const [org] = await db
        .select({ id: organizations.id, name: organizations.name, plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!org) return;

      const currentLifecycle = await this.getLifecycle(orgId);
      const now = new Date();
      const currentFailures = (currentLifecycle.failureCount ?? 0) + 1;

      // Automatically downgrade on 2 or more consecutive payment failures
      if (currentFailures >= 2) {
        const previousPlan = org.plan ?? "free";
        await db
          .update(organizations)
          .set({
            plan: "free",
            planStatus: "halted",
            updatedAt: now,
          })
          .where(eq(organizations.id, orgId));

        const updatedLifecycle: TenantBillingLifecycle = {
          ...currentLifecycle,
          failureCount: currentFailures,
          lastPaymentFailureAt: now.toISOString(),
          failureReason: `${reason} (2 consecutive failures: automatically downgraded to Free)`,
          gracePeriodEndsAt: null, // Grace period ends, account is downgraded & locked for reactivation
        };
        await this.setLifecycle(orgId, updatedLifecycle);

        try {
          await AuditService.log({
            organizationId: orgId,
            action: "billing.automatic_downgrade",
            entityType: "organization",
            entityId: orgId,
            metadata: { reason, failureCount: currentFailures, previousPlan, newPlan: "free" },
          });
        } catch {
          // ignore
        }

        try {
          await NotificationService.notifyOrgAdmins(orgId, {
            type: "billing_dunning",
            title: "Plan Downgraded to Free — Payment Failed Twice",
            body: `Your subscription payment failed 2 times. Your workspace has been downgraded to the Free tier. Reactivate your subscription at any time to restore access.`,
          }, undefined, "billing.manage");
        } catch (err) {
          console.warn("[lifecycleService] Failed to notify admins of downgrade", err);
        }

        return;
      }

      // 1st failure: 7-day grace period
      const graceEndsAt = new Date(now.getTime() + DEFAULT_GRACE_DAYS * 24 * 60 * 60 * 1000);

      const updatedLifecycle: TenantBillingLifecycle = {
        ...currentLifecycle,
        failureCount: currentFailures,
        gracePeriodEndsAt: graceEndsAt.toISOString(),
        lastPaymentFailureAt: now.toISOString(),
        failureReason: reason,
        dunningSentAt: now.toISOString(),
      };

      await this.setLifecycle(orgId, updatedLifecycle);

      // 1. In-App Bell Notification to all organization admins
      try {
        await NotificationService.notifyOrgAdmins(orgId, {
          type: "billing_dunning",
          title: "Payment Renewal Failed — 7-Day Grace Period",
          body: `Your ${org.plan} renewal could not be processed (${reason}). Features remain active until ${graceEndsAt.toLocaleDateString()}. Please update payment details.`,
        }, undefined, "billing.manage");
      } catch (err) {
        console.warn("[lifecycleService] Failed to notify admins of payment failure", err);
      }

      // 2. Automated Dunning Email to tenant admins
      try {
        await this.sendDunningEmail(orgId, org.name, org.plan, graceEndsAt, reason);
      } catch (err) {
        console.warn("[lifecycleService] Failed to send dunning email", err);
      }

      try {
        await AuditService.log({
          organizationId: orgId,
          action: "billing.payment_failed",
          entityType: "organization",
          entityId: orgId,
          metadata: { reason, failureCount: currentFailures, graceEndsAt: graceEndsAt.toISOString() },
        });
      } catch {
        // ignore
      }
    } catch (err) {
      console.warn("[lifecycleService] handlePaymentFailure error", err);
    }
  }

  static async sendDunningEmail(
    orgId: string,
    orgName: string,
    plan: string,
    graceEndsAt: Date | null,
    reason: string
  ): Promise<number> {
    let sent = 0;
    try {
      const admins = await recipientsWithPermission(orgId, "billing.manage");

      const billingUrl = appUrl("/settings?tab=billing");
      // null = the grace period is over and the workspace is locked.
      const expiryFormatted = graceEndsAt?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const status = expiryFormatted
        ? `<strong>Grace Period:</strong> Your account will remain fully operational until <strong>${expiryFormatted}</strong>.`
        : `<strong>Status:</strong> Some features are paused until the payment is resolved. Your data is safe.`;

      for (const admin of admins) {
        if (!admin.email) continue;
        await sendEmail({ from: "billing",
          to: admin.email,
          subject: expiryFormatted ? `[Action Required] Payment failed for ${esc(orgName)} — Grace period active` : `[Action Required] Payment overdue for ${esc(orgName)}`,
          preheader: expiryFormatted ? `Update your payment method before ${expiryFormatted} to avoid disruption` : "Update your payment method to restore paused features",
          html:
            mtag("Action required") +
            mh("Your payment didn't go through.") +
            mp("Hello, we couldn't collect the recurring payment for your workspace. Nothing is lost — but it needs a quick fix.") +
            mcallout(`<strong>Reason</strong> — ${esc(reason)}`, "danger") +
            mfacts([["Workspace", esc(orgName)], ["Plan", esc(plan)], [expiryFormatted ? "Fully active until" : "Status", expiryFormatted ?? "Some features paused"]]) +
            mp("Update your payment method to keep automations, WhatsApp integrations and team seats running.") +
            mbtn("Update payment method", billingUrl) +
            mfine("Already fixed it? Nothing more to do. Your data is always safely preserved."),
        });
        sent++;
      }
    } catch (err) {
      console.error("[lifecycleService] Failed to send dunning emails", err);
    }
    return sent;
  }

  static async handlePaymentSuccess(orgId: string): Promise<void> {
    try {
      const currentLifecycle = await this.getLifecycle(orgId);

      // Dedup: skip the notification + CAPI conversion if we already fired one for this payment
      // within the window. Clearing the grace/failure flags below stays idempotent and always runs.
      const lastNotifiedAt = currentLifecycle.lastPaymentSuccessNotifiedAt
        ? new Date(currentLifecycle.lastPaymentSuccessNotifiedAt).getTime()
        : 0;
      const alreadyNotified = Date.now() - lastNotifiedAt < PAYMENT_SUCCESS_NOTIFY_DEDUP_MS;

      const sendCapi = !currentLifecycle.capiSubscribeSentAt && !alreadyNotified;
      const updatedLifecycle: TenantBillingLifecycle = {
        ...currentLifecycle,
        ...(sendCapi ? { capiSubscribeSentAt: new Date().toISOString() } : {}),
        failureCount: 0,
        gracePeriodEndsAt: null,
        lastPaymentFailureAt: null,
        failureReason: null,
        ...(alreadyNotified ? {} : { lastPaymentSuccessNotifiedAt: new Date().toISOString() }),
      };
      await this.setLifecycle(orgId, updatedLifecycle);

      if (alreadyNotified) return;

      try {
        await NotificationService.notifyOrgAdmins(orgId, {
          type: "billing_success",
          title: "Subscription Payment Successful",
          body: "Your subscription payment was processed successfully. All features are fully active.",
        }, undefined, "billing.manage");
      } catch (err) {
        console.warn("[lifecycleService] Failed to notify admins of payment success", err);
      }

      try {
        await AuditService.log({
          organizationId: orgId,
          action: "billing.payment_cleared",
          entityType: "organization",
          entityId: orgId,
        });
      } catch {
        // ignore
      }

      // Meta Conversions API (CAPI) Subscribe / Purchase Event
      if (!sendCapi) return;
      try {
        const { MetaCapiService } = await import("@/domains/platform/capiService");
        const { PlatformAttributionService } = await import("@/domains/platform/attributionService");
        const attr = await PlatformAttributionService.getAttribution(orgId);
        const [o] = await db.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
        const paidValue = PLAN_MONTHLY_PRICE[canonicalPlan(o?.plan)];
        // Match on the workspace owner too: fbp/fbc alone is empty for Google/phone signups on another browser.
        const [owner] = await db.select({ email: users.email, phone: users.phone }).from(users)
          .where(eq(users.organizationId, orgId)).orderBy(users.createdAt).limit(1);
        const { sendGa4Event } = await import("@/lib/integrations/ga4");
        keepAlive(sendGa4Event(orgId, "purchase", { transaction_id: `first_sub_${orgId}`, value: paidValue, currency: "INR" }), "ga4 purchase");
        await MetaCapiService.sendEvent({
          eventName: "Subscribe",
          orgId,
          email: owner?.email && !isPlaceholderEmail(owner.email) ? owner.email : undefined,
          phone: owner?.phone ?? undefined,
          value: paidValue,
          currency: "INR",
          fbp: attr?.fbp,
          fbc: attr?.fbc,
          eventSourceUrl: attr?.landingPage || "https://ridhzo.com/billing",
        });
      } catch (err) {
        console.warn("[lifecycleService] Failed to dispatch Meta CAPI subscribe event", err);
      }
    } catch (err) {
      console.warn("[lifecycleService] handlePaymentSuccess error", err);
    }
  }

  static async extendGracePeriod(orgId: string, days = 7): Promise<TenantBillingLifecycle> {
    const currentLifecycle = await this.getLifecycle(orgId);
    const baseDate =
      currentLifecycle.gracePeriodEndsAt && new Date(currentLifecycle.gracePeriodEndsAt).getTime() > Date.now()
        ? new Date(currentLifecycle.gracePeriodEndsAt)
        : new Date();

    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    const updated: TenantBillingLifecycle = {
      ...currentLifecycle,
      gracePeriodEndsAt: newEnd.toISOString(),
    };
    await this.setLifecycle(orgId, updated);

    await NotificationService.notifyOrgAdmins(orgId, {
      type: "billing_grace_extended",
      title: `Grace Period Extended (+${days} Days)`,
      body: `Platform operations extended your grace period until ${newEnd.toLocaleDateString()}. Full access is preserved.`,
    }, undefined, "billing.manage");

    return updated;
  }

  static async markManuallyPaid(orgId: string, days = 30): Promise<TenantBillingLifecycle> {
    const currentLifecycle = await this.getLifecycle(orgId);
    const paidUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const updated: TenantBillingLifecycle = {
      ...currentLifecycle,
      manualPaidUntil: paidUntil.toISOString(),
      gracePeriodEndsAt: null,
      lastPaymentFailureAt: null,
      failureReason: null,
    };
    await this.setLifecycle(orgId, updated);

    await NotificationService.notifyOrgAdmins(orgId, {
      type: "billing_manual_paid",
      title: "Payment Recorded Offline",
      body: `Platform operations recorded offline payment. Paid status valid until ${paidUntil.toLocaleDateString()}.`,
    }, undefined, "billing.manage");

    return updated;
  }

  static async assertFeatureAccess(orgId: string, featureName: string): Promise<void> {
    const info = await this.getTenantBillingStatus(orgId);
    if (info && info.status === "locked") {
      throw new Error(
        `Feature "${featureName}" is locked due to overdue subscription payment. Please update your billing method in Settings to restore access.`
      );
    }
  }

  static async listFleetBillingStatus(): Promise<TenantBillingInfo[]> {
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        planStatus: organizations.planStatus,
        currentPeriodEnd: organizations.currentPeriodEnd,
        razorpaySubscriptionId: organizations.razorpaySubscriptionId,
        trialEndsAt: organizations.trialEndsAt,
        complimentary: organizations.complimentary,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));

    // One query for every tenant's lifecycle blob instead of one per org.
    const prefix = "billing_lifecycle:";
    const lifecycles = new Map<string, TenantBillingLifecycle>();
    try {
      const rows = (await db.execute(
        sql`SELECT key, value FROM platform_configs WHERE key LIKE ${prefix + "%"}`
      )) as unknown as Array<{ key: string; value: TenantBillingLifecycle }>;
      for (const r of rows) lifecycles.set(r.key.slice(prefix.length), r.value);
    } catch (err) {
      console.error("[lifecycleService] fleet lifecycle read failed", err);
    }

    const results: TenantBillingInfo[] = [];

    for (const org of orgs) {
      const lifecycle = lifecycles.get(org.id) ?? {};
      const { status, daysRemainingInGrace } = this.computeStatus(org, lifecycle);

      results.push({
        orgId: org.id,
        orgName: org.name,
        slug: org.slug,
        plan: org.plan ?? "free",
        planStatus: org.planStatus ?? "active",
        status,
        gracePeriodEndsAt: lifecycle.gracePeriodEndsAt ?? null,
        daysRemainingInGrace,
        lastPaymentFailureAt: lifecycle.lastPaymentFailureAt ?? null,
        failureReason: lifecycle.failureReason ?? null,
        failureCount: lifecycle.failureCount ?? 0,
        dunningSentAt: lifecycle.dunningSentAt ?? null,
        manualPaidUntil: lifecycle.manualPaidUntil ?? null,
        currentPeriodEnd: org.currentPeriodEnd ? new Date(org.currentPeriodEnd).toISOString() : null,
        razorpaySubscriptionId: org.razorpaySubscriptionId ?? null,
        trialEndsAt: org.trialEndsAt ? new Date(org.trialEndsAt).toISOString() : null,
      });
    }

    return results;
  }

  // Complimentary plans with an end date move to Free once it passes; the owner is told how to keep it.
  static async endExpiredComplimentary(now: Date = new Date()): Promise<number> {
    const ended = await db
      .update(organizations)
      .set({ plan: "free", complimentary: 0, complimentaryUntil: null, updatedAt: new Date() })
      .where(and(eq(organizations.complimentary, 1), isNotNull(organizations.complimentaryUntil), lte(organizations.complimentaryUntil, now)))
      .returning({ id: organizations.id, name: organizations.name, note: organizations.complimentaryNote });

    for (const org of ended) {
      await AuditService.log({
        organizationId: org.id,
        userId: null, // system
        action: "billing.complimentary_ended",
        entityType: "organization",
        entityId: org.id,
        metadata: { note: org.note },
      });
      try {
        // Everyone who manages billing for the workspace — not just whichever user happens to be first.
        for (const owner of await recipientsWithPermission(org.id, "billing.manage")) {
          await sendEmail({ from: "billing",
            to: owner.email,
            subject: `Your free Ridhzo plan for ${org.name} has ended`,
            preheader: "Your leads and follow-ups are safe — pick a plan to keep everything running",
            html:
              mtag("Plan update") +
              mh("Your free plan has ended.") +
              mp(`Hello ${esc(owner.firstName || "there")}, the complimentary plan for <strong>${esc(org.name)}</strong> has finished, so the workspace now runs on Free. Your leads and follow-ups are safe.`) +
              mcompare(
                { title: "Before", items: ["Complimentary plan", "AI replies", "All lead sources", "Full automations"] },
                { title: "Now", items: ["Free plan", "Leads &amp; follow-ups kept", "Extras paused, not deleted"] },
              ) +
              mp(`Want everything back? Plans start at ${PLAN_LIMITS.starter.price.replace(" / mo", "")} a month.`) +
              mbtn("Choose a plan", appUrl("/settings/billing")),
          });
        }
      } catch {
        // non-blocking
      }
    }
    return ended.length;
  }

  static async downgradeExpiredTrials(now: Date = new Date()): Promise<{
    downgradedCount: number;
    downgradedOrgs: Array<{ id: string; name: string; slug: string; previousPlan: string }>;
  }> {
    const expired = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        trialEndsAt: organizations.trialEndsAt,
        razorpaySubscriptionId: organizations.razorpaySubscriptionId,
      })
      .from(organizations)
      .where(
        and(
          isNotNull(organizations.trialEndsAt),
          lte(organizations.trialEndsAt, now),
          ne(organizations.plan, "free")
        )
      );

    const downgradedOrgs: Array<{ id: string; name: string; slug: string; previousPlan: string }> = [];

    for (const org of expired) {
      await db
        .update(organizations)
        .set({
          plan: "free",
          trialEndsAt: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id));

      downgradedOrgs.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        previousPlan: org.plan,
      });

      await AuditService.log({
        organizationId: org.id,
        userId: null, // system
        action: "billing.trial_expired_downgrade",
        entityType: "organization",
        entityId: org.id,
        metadata: {
          previousPlan: org.plan,
          revertedTo: "free",
          expiredAt: org.trialEndsAt ? new Date(org.trialEndsAt).toISOString() : null,
        },
      });

      try {
        // Everyone who manages billing for the workspace — not just whichever user happens to be first.
        for (const owner of await recipientsWithPermission(org.id, "billing.manage")) {
          await sendEmail({ from: "billing",
            to: owner.email,
            subject: `Your Ridhzo trial for ${org.name} has ended — your leads are safe`,
            preheader: "Your leads and follow-ups are safe — upgrade to keep everything running",
            html:
              mtag("Trial complete") +
              mh("Your trial has ended.<br>Your leads haven't.") +
              mp(`Hello ${esc(owner.firstName || "there")}, the <strong>${esc(org.plan)}</strong> trial on <strong>${esc(org.name)}</strong> is over. The workspace is now on Free, and everything you captured is safe.`) +
              mcompare(
                { title: `${org.plan} trial`, items: ["Full feature access", "Higher limits"] },
                { title: "Free plan", items: [`${PLAN_LIMITS.free.aiCredits} AI credits / month`, `${PLAN_LIMITS.free.automations} automations`, `${PLAN_LIMITS.free.sequences} sequence`, `${PLAN_LIMITS.free.sources} lead source`] },
              ) +
              mp(`Anything above the Free limits is paused, not deleted. Keep it all running from ${PLAN_LIMITS.starter.price.replace(" / mo", "")} a month.`) +
              mbtn("Upgrade to Starter", appUrl("/settings/billing")),
          });
        }
      } catch {
        // non-blocking
      }
    }

    if (downgradedOrgs.length > 0) {
      try {
        const { OpsAlertService } = await import("@/domains/platform/opsAlertService");
        await OpsAlertService.dispatchAlert(
          "billing.trial_downgrade",
          "Trials Expired — Downgraded to Free",
          `${downgradedOrgs.length} trial workspace(s) expired and automatically reverted to Free: ${downgradedOrgs.map((o) => `${o.name} (${o.previousPlan})`).join(", ")}`
        );
      } catch {
        // non-blocking
      }
    }

    return {
      downgradedCount: downgradedOrgs.length,
      downgradedOrgs,
    };
  }
}
