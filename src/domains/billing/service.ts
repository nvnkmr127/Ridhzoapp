import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLAN_LIMITS } from "./planService";
import * as razorpay from "@/lib/billing/razorpay";
import { AuditService } from "@/domains/audit/service";

// Which plan a Razorpay subscription status maps the org to. Paid tiers only apply while active.
const PAID_PLANS = Object.keys(PLAN_LIMITS).filter((p) => p !== "free");

// Razorpay statuses that mean "the customer has paid / authorised the mandate".
const PAID_STATUSES = new Set(["authenticated", "active"]);

const PLAN_ORDER = ["free", "starter", "unlimited"];
const CANONICAL: Record<string, string> = { pro: "starter", business: "unlimited" };

export class BillingService {
  static async get(organizationId: string) {
    const [org] = await db
      .select({
        plan: organizations.plan,
        planStatus: organizations.planStatus,
        currentPeriodEnd: organizations.currentPeriodEnd,
        subscriptionId: organizations.razorpaySubscriptionId,
        trialEndsAt: organizations.trialEndsAt,
        cancelAtPeriodEnd: organizations.cancelAtPeriodEnd,
        customerId: organizations.razorpayCustomerId,
        billingName: organizations.billingName,
        gstin: organizations.gstin,
        name: organizations.name,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return org;
  }

  // Create a Razorpay subscription for a paid plan and hand the browser what checkout needs.
  // Deliberately writes nothing about the plan: an abandoned checkout must not replace the customer's
  // live subscription id (that orphaned their real subscription). The subscription is tied to the
  // org via notes.organizationId instead.
  static async startSubscription(
    organizationId: string,
    plan: string,
    opts: { cycle?: razorpay.BillingCycle; couponCode?: string | null; contact?: { email?: string; phone?: string } } = {},
  ) {
    if (!PAID_PLANS.includes(plan)) throw new Error("Unknown plan");
    if (!razorpay.isConfigured()) throw new Error("Billing is not configured");
    const cycle = opts.cycle ?? "monthly";
    const planId = razorpay.planIdFor(plan, cycle);
    if (!planId) throw new Error(cycle === "yearly" ? "Yearly billing isn't available yet." : `No Razorpay plan_id configured for "${plan}"`);

    const org = await this.get(organizationId);
    let offerId: string | null = null;
    let couponCode: string | null = null;
    if (opts.couponCode?.trim()) {
      const { CouponService } = await import("./couponService");
      const c = await CouponService.forCheckout(opts.couponCode, plan);
      if (!c.ok) throw new Error(c.message);
      offerId = c.coupon.razorpayOfferId ?? null;
      couponCode = c.coupon.code;
    }

    const startAt = this.firstChargeDate(org, plan);
    const customerId = await this.ensureCustomer(organizationId, org, opts.contact);
    const sub = await razorpay.createSubscription(planId, organizationId, { startAt, cycle, offerId, customerId, couponCode });
    return { subscriptionId: sub.id, keyId: razorpay.publicKeyId(), shortUrl: sub.short_url, firstChargeAt: startAt?.toISOString() ?? null };
  }

  // When the new subscription's first charge should happen, so nobody pays twice for the same days:
  //  - mid-trial → when the trial ends;
  //  - on a paid plan, switching DOWN or re-subscribing after cancelling → when the paid period ends
  //    (they keep what they paid for until then).
  // Upgrades start now — the customer wants the bigger plan today. null = charge now.
  static firstChargeDate(
    org: { plan?: string | null; planStatus?: string | null; trialEndsAt?: Date | null; currentPeriodEnd?: Date | null } | undefined,
    target: string,
    now = Date.now(),
  ): Date | null {
    const soon = now + 60 * 60 * 1000; // Razorpay wants start_at in the future
    if (org?.trialEndsAt && new Date(org.trialEndsAt).getTime() > soon) return new Date(org.trialEndsAt);
    const current = CANONICAL[org?.plan ?? ""] ?? org?.plan ?? "free";
    const end = org?.currentPeriodEnd ? new Date(org.currentPeriodEnd) : null;
    const paidUp = current !== "free" && org?.planStatus === "active" && end && end.getTime() > soon;
    if (!paidUp) return null;
    const rank = (p: string) => PLAN_ORDER.indexOf(p);
    return rank(target) <= rank(current) ? end : null;
  }

  // Razorpay customer (reused) so GST details land on Razorpay's invoices. Best-effort: checkout
  // still works without one.
  private static async ensureCustomer(
    organizationId: string,
    org: Awaited<ReturnType<typeof BillingService.get>>,
    contact?: { email?: string; phone?: string },
  ) {
    if (org?.customerId) return org.customerId;
    try {
      const c = await razorpay.upsertCustomer({ name: org?.billingName || org?.name || "Ridhzo customer", email: contact?.email, contact: contact?.phone, gstin: org?.gstin });
      await db.update(organizations).set({ razorpayCustomerId: c.id }).where(eq(organizations.id, organizationId));
      return c.id;
    } catch (e) {
      console.error("[billing] Razorpay customer create failed (continuing without)", e);
      return null;
    }
  }

  // GST details for invoices. Also pushed to the Razorpay customer so future invoices carry them.
  static async saveGstDetails(organizationId: string, input: { billingName: string | null; gstin: string | null }) {
    const [row] = await db.update(organizations).set({ billingName: input.billingName, gstin: input.gstin })
      .where(eq(organizations.id, organizationId))
      .returning({ customerId: organizations.razorpayCustomerId, name: organizations.name });
    if (row?.customerId) {
      await razorpay.updateCustomerGstin(row.customerId, { name: input.billingName || row.name, gstin: input.gstin }).catch(() => {});
    }
  }

  // Live facts from Razorpay for the billing page (one call): monthly/yearly, and a switch booked for
  // later (downgrade / resubscribe / early trial subscription) that hasn't started charging yet.
  static async subscriptionInfo(organizationId: string): Promise<{
    cycle: razorpay.BillingCycle | null;
    scheduled: { plan: string; startsAt: string } | null;
  }> {
    const none = { cycle: null, scheduled: null };
    const org = await this.get(organizationId);
    if (!org?.subscriptionId || !razorpay.isConfigured()) return none;
    try {
      const sub = await razorpay.fetchSubscription(org.subscriptionId);
      const plan = razorpay.planForPlanId(sub.plan_id);
      const future = sub.status === "authenticated" && !!sub.start_at && sub.start_at * 1000 > Date.now();
      return {
        cycle: razorpay.cycleForPlanId(sub.plan_id),
        scheduled: future && plan ? { plan, startsAt: new Date(sub.start_at! * 1000).toISOString() } : null,
      };
    } catch {
      return none;
    }
  }

  // Testing/admin override: set the plan directly with no payment. Only safe when billing is
  // unconfigured (no Razorpay) — the caller enforces that so this can never grant paid plans for
  // free once real billing is wired. Clears any stored subscription id.
  static async setPlanManually(organizationId: string, plan: string) {
    if (plan !== "free" && !PAID_PLANS.includes(plan)) throw new Error("Unknown plan");
    await db.update(organizations)
      .set({ plan, planStatus: "active", razorpaySubscriptionId: null, currentPeriodEnd: null, trialEndsAt: null, cancelAtPeriodEnd: 0 })
      .where(eq(organizations.id, organizationId));
  }

  // Switch the org onto a paid subscription. The PLAN comes from the subscription itself (its
  // Razorpay plan_id), never from the browser — otherwise paying for Starter and claiming
  // "unlimited" would grant Unlimited. Also cancels the subscription it replaces, so an upgrade
  // doesn't leave the customer billed twice.
  static async activate(organizationId: string, subscriptionId: string) {
    const sub = await razorpay.fetchSubscription(subscriptionId);
    if (sub.notes?.organizationId && sub.notes.organizationId !== organizationId) {
      throw new Error("This subscription belongs to another workspace.");
    }
    const plan = razorpay.planForPlanId(sub.plan_id);
    if (!plan) throw new Error("This subscription isn't for a Ridhzo plan.");
    if (!PAID_STATUSES.has(sub.status)) throw new Error("The payment hasn't gone through yet. Please try again in a minute.");

    const before = await this.get(organizationId);
    const inTrial = !!before?.trialEndsAt && new Date(before.trialEndsAt).getTime() > Date.now();
    // A downgrade / resubscribe booked for the end of the paid period: the customer keeps the plan
    // they paid for until the new subscription's first charge (the webhook switches it then).
    const scheduled =
      !inTrial && before?.plan !== "free" && before?.planStatus === "active" &&
      sub.status === "authenticated" && !!sub.start_at && sub.start_at * 1000 > Date.now();

    // Paid period end, or — for a mandate set up for later — the first charge date ("Renews on …").
    const endUnix = sub.current_end ?? sub.charge_at ?? sub.start_at;
    const periodEnd = endUnix ? new Date(endUnix * 1000) : null;
    await db.update(organizations)
      .set({
        ...(scheduled ? {} : { plan }),
        planStatus: "active",
        razorpaySubscriptionId: sub.id,
        trialEndsAt: null, // paid → trial over, never auto-downgrade
        cancelAtPeriodEnd: 0,
        ...(periodEnd && !scheduled ? { currentPeriodEnd: periodEnd } : {}),
      })
      .where(eq(organizations.id, organizationId));

    if (before?.subscriptionId && before.subscriptionId !== sub.id) {
      // Scheduled: the old one runs out the period already paid for. Otherwise stop it now so the
      // customer isn't billed twice. Best-effort — log loudly rather than undo the new subscription.
      await razorpay.cancelSubscription(before.subscriptionId, scheduled).catch((e) =>
        console.error(`[billing] could not cancel replaced subscription ${before.subscriptionId} for org ${organizationId}`, e),
      );
    }

    if (sub.notes?.couponCode) {
      const { CouponService } = await import("./couponService");
      await CouponService.redeem(sub.notes.couponCode).catch(() => {});
    }

    const { BillingLifecycleService } = await import("./lifecycleService");
    await BillingLifecycleService.handlePaymentSuccess(organizationId);
    return { plan, scheduled, startsAt: scheduled && sub.start_at ? new Date(sub.start_at * 1000).toISOString() : null };
  }

  // Cancel. With live billing the paid plan runs to the end of the period already paid for; the
  // Razorpay "cancelled" webhook then drops the org to free. Without billing (testing) it's immediate.
  static async cancel(organizationId: string) {
    const org = await this.get(organizationId);
    if (org?.subscriptionId && razorpay.isConfigured()) {
      await razorpay.cancelSubscription(org.subscriptionId, true);
      await db.update(organizations).set({ cancelAtPeriodEnd: 1 }).where(eq(organizations.id, organizationId));
      return { atPeriodEnd: true, endsAt: org.currentPeriodEnd ?? null };
    }
    await db.update(organizations)
      .set({ plan: "free", planStatus: "cancelled", trialEndsAt: null, cancelAtPeriodEnd: 0 })
      .where(eq(organizations.id, organizationId));
    return { atPeriodEnd: false, endsAt: null };
  }

  // Payment receipts for the current subscription (Razorpay issues one per charge).
  static async invoices(organizationId: string) {
    const org = await this.get(organizationId);
    if (!org?.subscriptionId && !org?.customerId) return [];
    return razorpay.listInvoices({ customerId: org.customerId, subscriptionId: org.subscriptionId }).catch(() => []);
  }

  // Reconcile from a verified webhook. Razorpay is the source of truth for the subscription state.
  // System-attributed (userId: null): this is the only path that can change billing state with no
  // user in the loop, and previously left no trace at all when it did.
  static async handleWebhook(
    event: string,
    subscriptionEntity: { id?: string; current_end?: number; plan_id?: string; notes?: Record<string, string> } | undefined,
  ) {
    const subId = subscriptionEntity?.id;
    if (!subId) return;
    const cols = {
      id: organizations.id, plan: organizations.plan, planStatus: organizations.planStatus,
      currentPeriodEnd: organizations.currentPeriodEnd, subscriptionId: organizations.razorpaySubscriptionId,
    };
    // Current subscription first; a brand-new one (checkout closed before verify ran) is found via notes.
    let [org] = await db.select(cols).from(organizations).where(eq(organizations.razorpaySubscriptionId, subId)).limit(1);
    const noteOrg = subscriptionEntity?.notes?.organizationId;
    if (!org && noteOrg) [org] = await db.select(cols).from(organizations).where(eq(organizations.id, noteOrg)).limit(1);
    if (!org) return;
    const isCurrent = org.subscriptionId === subId;

    const periodEnd = subscriptionEntity.current_end ? new Date(subscriptionEntity.current_end * 1000) : undefined;

    // Razorpay does not guarantee delivery order. Drop a stale/duplicate activation whose billing
    // period is not newer than what we've already stored, so a late "charged" can't resurrect a
    // plan a later "cancelled" already ended. A genuine renewal/resubscribe carries a newer period.
    const isActivation = event === "subscription.authenticated" || event === "subscription.activated" || event === "subscription.charged" || event === "subscription.resumed";
    if (isActivation && isCurrent && periodEnd && org.currentPeriodEnd && periodEnd <= org.currentPeriodEnd) {
      return;
    }
    const oldPlan = org.plan;
    const oldStatus = org.planStatus;
    let newStatus = oldStatus;
    let newPlan = oldPlan;

    switch (event) {
      case "subscription.authenticated": // mandate set up (trial users are charged later, at trial end)
      case "subscription.activated":
      case "subscription.charged":
      case "subscription.resumed": {
        if (!isCurrent) {
          // A paid subscription the browser never confirmed (tab closed after paying). Grant it here.
          const res = await this.activate(org.id, subId).catch((e) => {
            console.error(`[billing] webhook activation failed for ${subId}`, e);
            return null;
          });
          if (!res) return;
          newPlan = res.plan;
          newStatus = "active";
          break;
        }
        newStatus = "active";
        // A real charge (not just the mandate) — the plan follows the subscription. This is what
        // switches a downgrade booked for the period end.
        const charged = event !== "subscription.authenticated" ? razorpay.planForPlanId(subscriptionEntity.plan_id) : null;
        if (charged) newPlan = charged;
        await db.update(organizations)
          .set({ planStatus: "active", ...(charged ? { plan: charged } : {}), ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}) })
          .where(eq(organizations.id, org.id));
        const { BillingLifecycleService } = await import("./lifecycleService");
        await BillingLifecycleService.handlePaymentSuccess(org.id);
        break;
      }
      case "subscription.halted":
      case "subscription.paused": {
        if (!isCurrent) return; // a replaced/abandoned subscription failing is not this org's problem
        newStatus = "halted";
        await db.update(organizations).set({ planStatus: "halted" }).where(eq(organizations.id, org.id));
        const { BillingLifecycleService } = await import("./lifecycleService");
        await BillingLifecycleService.handlePaymentFailure(org.id, `Razorpay event: ${event}`);
        break;
      }
      case "subscription.cancelled":
      case "subscription.completed":
        // Only the org's CURRENT subscription ending drops it to free — the old one we cancel on an
        // upgrade also sends "cancelled", and must not downgrade the customer who just paid more.
        if (!isCurrent) return;
        newPlan = "free";
        newStatus = "cancelled";
        await db.update(organizations)
          .set({ plan: "free", planStatus: "cancelled", cancelAtPeriodEnd: 0, razorpaySubscriptionId: null })
          .where(eq(organizations.id, org.id));
        break;
      default:
        return; // unhandled event type — nothing changed, nothing to log
    }

    await AuditService.log({
      organizationId: org.id,
      action: "billing.plan_changed",
      entityType: "organization",
      entityId: org.id,
      metadata: { event, subscriptionId: subId, oldPlan, newPlan, oldStatus, newStatus },
    });
  }
}
