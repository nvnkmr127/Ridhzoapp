"use server";

import { requirePermission } from "@/lib/rbac";
import { BillingService } from "@/domains/billing/service";
import { AuditService } from "@/domains/audit/service";
import { verifyPaymentSignature, isConfigured } from "@/lib/billing/razorpay";
import { PLAN_LIMITS } from "@/domains/billing/planService";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail } from "@/lib/actions/result";

export async function getBillingAction() {
  const { organizationId } = await requirePermission("billing.manage");
  const billing = await BillingService.get(organizationId);
  return { ...billing, configured: isConfigured(), limits: PLAN_LIMITS };
}

const startSchema = z.object({
  plan: z.string(),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  couponCode: z.string().trim().max(40).optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export async function startSubscriptionAction(input: z.input<typeof startSchema>) {
  const { organizationId, userId } = await requirePermission("billing.manage");
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Please pick a plan.");
  const { plan, cycle, couponCode, email, phone } = parsed.data;
  try {
    const result = await BillingService.startSubscription(organizationId, plan, { cycle, couponCode, contact: { email, phone } });
    await AuditService.log({ organizationId, userId, action: "billing.subscribe_start", entityType: "organization", entityId: organizationId, metadata: { plan, cycle, couponCode: couponCode || null } });
    return ok(result); // { subscriptionId, keyId }
  } catch (e) {
    return actionFail(e);
  }
}

// No `plan` field: which plan was bought is read from the subscription at Razorpay (see activate).
const verifySchema = z.object({
  subscriptionId: z.string(),
  paymentId: z.string(),
  signature: z.string(),
});

// Called by the checkout success handler. We re-verify the signature server-side before granting anything.
export async function verifySubscriptionAction(input: z.infer<typeof verifySchema>) {
  const { organizationId, userId } = await requirePermission("billing.manage");
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "The payment confirmation was incomplete. Please try again.");
  const data = parsed.data;

  const valid = verifyPaymentSignature({ paymentId: data.paymentId, subscriptionId: data.subscriptionId, signature: data.signature });
  if (!valid) return fail("VALIDATION", "We couldn't verify this payment. If you were charged, contact support — you won't be charged twice.");

  try {
    // activate() checks the subscription belongs to this org and reads the plan from it.
    const { plan, scheduled, startsAt } = await BillingService.activate(organizationId, data.subscriptionId);
    await AuditService.log({ organizationId, userId, action: "billing.subscribe_activate", entityType: "organization", entityId: organizationId, metadata: { plan, scheduled } });
    revalidatePath("/", "layout");
    return ok({ activated: true, plan, scheduled, startsAt });
  } catch (e) {
    return actionFail(e);
  }
}

// Testing/admin override: switch plans without payment. Allowed ONLY while billing is unconfigured
// (no Razorpay keys) — once real billing is wired, this refuses and the checkout flow is used instead,
// so it can never be a free-upgrade path in production.
export async function setPlanManuallyAction(plan: string) {
  const { organizationId, userId } = await requirePermission("billing.manage");
  if (isConfigured()) {
    return fail("FORBIDDEN", "Billing is configured — use checkout to change plans.");
  }
  if (!(plan in PLAN_LIMITS)) return fail("VALIDATION", "Unknown plan.");
  try {
    await BillingService.setPlanManually(organizationId, plan);
    await AuditService.log({ organizationId, userId, action: "billing.plan_set_manual", entityType: "organization", entityId: organizationId, metadata: { plan } });
    revalidatePath("/", "layout");
    return ok({ plan });
  } catch (e) {
    return actionFail(e);
  }
}

export async function cancelSubscriptionAction() {
  const { organizationId, userId } = await requirePermission("billing.manage");
  try {
    const { atPeriodEnd, endsAt } = await BillingService.cancel(organizationId);
    await AuditService.log({ organizationId, userId, action: "billing.cancel", entityType: "organization", entityId: organizationId, metadata: { atPeriodEnd } });
    revalidatePath("/", "layout");
    return ok({ cancelled: true, atPeriodEnd, endsAt: endsAt ? new Date(endsAt).toISOString() : null });
  } catch (e) {
    return actionFail(e);
  }
}

// Preview a promo code before checkout (the real check happens again when the subscription is created).
export async function checkCouponAction(code: string, plan: string) {
  await requirePermission("billing.manage");
  const { CouponService } = await import("@/domains/billing/couponService");
  const res = await CouponService.forCheckout(String(code ?? ""), String(plan ?? ""));
  return res.ok ? ok({ message: res.message }) : fail("VALIDATION", res.message);
}

// GSTIN: 2-digit state code, 10-char PAN, entity digit, Z, check char.
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const gstSchema = z.object({
  billingName: z.string().trim().max(255).transform((v) => v || null),
  gstin: z.string().trim().toUpperCase().transform((v) => v || null)
    .refine((v) => v === null || GSTIN.test(v), "That GSTIN doesn't look right — it's 15 characters, like 36ABCDE1234F1Z5."),
});

export async function saveGstDetailsAction(input: z.input<typeof gstSchema>) {
  const { organizationId, userId } = await requirePermission("billing.manage");
  const parsed = gstSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check your GST details.");
  try {
    await BillingService.saveGstDetails(organizationId, parsed.data);
    await AuditService.log({ organizationId, userId, action: "billing.gst_update", entityType: "organization", entityId: organizationId, metadata: { hasGstin: !!parsed.data.gstin } });
    revalidatePath("/settings/billing");
    return ok(parsed.data);
  } catch (e) {
    return actionFail(e);
  }
}
