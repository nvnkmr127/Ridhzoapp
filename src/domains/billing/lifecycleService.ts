import { db } from "@/db";
import { organizations, users, roles } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { PlatformConfigService } from "@/domains/platform/configService";
import { NotificationService } from "@/domains/notifications/service";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { AuditService } from "@/domains/audit/service";

export type BillingStatus = "paid" | "pending" | "grace_period" | "locked" | "free";

export interface TenantBillingLifecycle {
  gracePeriodEndsAt?: string | null;
  lastPaymentFailureAt?: string | null;
  failureReason?: string | null;
  dunningSentAt?: string | null;
  manualPaidUntil?: string | null;
}

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
  dunningSentAt: string | null;
  manualPaidUntil: string | null;
  currentPeriodEnd: string | null;
  razorpaySubscriptionId: string | null;
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
    org: { plan?: string | null; planStatus?: string | null },
    lifecycle: TenantBillingLifecycle
  ): { status: BillingStatus; daysRemainingInGrace: number } {
    const now = Date.now();

    // 1. Manual offline override check
    if (lifecycle.manualPaidUntil && new Date(lifecycle.manualPaidUntil).getTime() > now) {
      return { status: "paid", daysRemainingInGrace: 0 };
    }

    const plan = org.plan ?? "free";
    if (plan === "free") {
      return { status: "free", daysRemainingInGrace: 0 };
    }

    const planStatus = org.planStatus ?? "active";

    // 2. Active paid subscription
    if (planStatus === "active") {
      return { status: "paid", daysRemainingInGrace: 0 };
    }

    // 3. Checkout initiated but not yet charged
    if (planStatus === "created") {
      return { status: "pending", daysRemainingInGrace: 0 };
    }

    // 4. Halted, cancelled, or failed payment: check grace period
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
    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        planStatus: organizations.planStatus,
        currentPeriodEnd: organizations.currentPeriodEnd,
        razorpaySubscriptionId: organizations.razorpaySubscriptionId,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) return null;

    const lifecycle = await this.getLifecycle(orgId);
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
      dunningSentAt: lifecycle.dunningSentAt ?? null,
      manualPaidUntil: lifecycle.manualPaidUntil ?? null,
      currentPeriodEnd: org.currentPeriodEnd ? new Date(org.currentPeriodEnd).toISOString() : null,
      razorpaySubscriptionId: org.razorpaySubscriptionId ?? null,
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
      const graceEndsAt = new Date(now.getTime() + DEFAULT_GRACE_DAYS * 24 * 60 * 60 * 1000);

      const updatedLifecycle: TenantBillingLifecycle = {
        ...currentLifecycle,
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
        });
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
          metadata: { reason, graceEndsAt: graceEndsAt.toISOString() },
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
    graceEndsAt: Date,
    reason: string
  ): Promise<void> {
    try {
      const adminUsers = await db
        .select({ email: users.email, roleName: roles.name, permissions: roles.permissions })
        .from(users)
        .leftJoin(roles, eq(users.roleId, roles.id))
        .where(and(eq(users.organizationId, orgId), eq(users.isActive, true)));

      const admins = adminUsers.filter((u) => {
        const role = (u.roleName ?? "").toLowerCase();
        return role === "admin" || (u.permissions ?? []).includes("*");
      });

      const billingUrl = appUrl("/settings?tab=billing");
      const expiryFormatted = graceEndsAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      for (const admin of admins) {
        if (!admin.email) continue;
        await sendEmail({
          to: admin.email,
          subject: `[Action Required] Payment failed for ${orgName} — Grace period active`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #111;">
              <h2 style="color: #d97706; margin-top: 0;">Subscription Payment Failed</h2>
              <p>Hello,</p>
              <p>We were unable to process the recurring payment for your <strong>${plan}</strong> plan on <strong>${orgName}</strong>.</p>
              <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 14px;">
                <strong>Reason:</strong> ${reason}<br />
                <strong>Grace Period:</strong> Your account will remain fully operational until <strong>${expiryFormatted}</strong>.
              </p>
              <p>To avoid any disruption to your automated workflows, WhatsApp integrations, and team seats, please update your billing payment method promptly:</p>
              <p style="margin: 24px 0;">
                <a href="${billingUrl}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; display: inline-block;">Update Payment Method</a>
              </p>
              <p style="font-size: 12px; color: #6b7280; margin-top: 32px;">
                If you believe this is an error or already resolved it, no further action is needed. Your data is always safely preserved.
              </p>
            </div>
          `,
        });
      }
    } catch (err) {
      console.error("[lifecycleService] Failed to send dunning emails", err);
    }
  }

  static async handlePaymentSuccess(orgId: string): Promise<void> {
    try {
      const currentLifecycle = await this.getLifecycle(orgId);
      const updatedLifecycle: TenantBillingLifecycle = {
        ...currentLifecycle,
        gracePeriodEndsAt: null,
        lastPaymentFailureAt: null,
        failureReason: null,
      };
      await this.setLifecycle(orgId, updatedLifecycle);

      try {
        await NotificationService.notifyOrgAdmins(orgId, {
          type: "billing_success",
          title: "Subscription Payment Successful",
          body: "Your subscription payment was processed successfully. All features are fully active.",
        });
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
      try {
        const { MetaCapiService } = await import("@/domains/platform/capiService");
        const { PlatformAttributionService } = await import("@/domains/platform/attributionService");
        const attr = await PlatformAttributionService.getAttribution(orgId);
        await MetaCapiService.sendEvent({
          eventName: "Subscribe",
          orgId,
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
    });

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
    });

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
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));

    const results: TenantBillingInfo[] = [];

    for (const org of orgs) {
      const lifecycle = await this.getLifecycle(org.id);
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
        dunningSentAt: lifecycle.dunningSentAt ?? null,
        manualPaidUntil: lifecycle.manualPaidUntil ?? null,
        currentPeriodEnd: org.currentPeriodEnd ? new Date(org.currentPeriodEnd).toISOString() : null,
        razorpaySubscriptionId: org.razorpaySubscriptionId ?? null,
      });
    }

    return results;
  }
}
