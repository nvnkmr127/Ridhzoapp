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

export async function startSubscriptionAction(plan: string) {
  const { organizationId, userId } = await requirePermission("billing.manage");
  try {
    const result = await BillingService.startSubscription(organizationId, plan);
    await AuditService.log({ organizationId, userId, action: "billing.subscribe_start", entityType: "organization", entityId: organizationId, metadata: { plan } });
    return ok(result); // { subscriptionId, keyId }
  } catch (e) {
    return actionFail(e);
  }
}

const verifySchema = z.object({
  plan: z.string(),
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

  const currentBilling = await BillingService.get(organizationId);
  if (!currentBilling?.subscriptionId || currentBilling.subscriptionId !== data.subscriptionId) {
    return fail("FORBIDDEN", "This subscription payment does not match your pending subscription.");
  }

  const valid = verifyPaymentSignature({ paymentId: data.paymentId, subscriptionId: data.subscriptionId, signature: data.signature });
  if (!valid) return fail("VALIDATION", "We couldn't verify this payment. If you were charged, contact support — you won't be charged twice.");

  try {
    await BillingService.activate(organizationId, data.plan, data.subscriptionId);
    await AuditService.log({ organizationId, userId, action: "billing.subscribe_activate", entityType: "organization", entityId: organizationId, metadata: { plan: data.plan } });
    revalidatePath("/settings/billing");
    return ok({ activated: true });
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
    revalidatePath("/settings/billing");
    return ok({ plan });
  } catch (e) {
    return actionFail(e);
  }
}

export async function cancelSubscriptionAction() {
  const { organizationId, userId } = await requirePermission("billing.manage");
  try {
    await BillingService.cancel(organizationId);
    await AuditService.log({ organizationId, userId, action: "billing.cancel", entityType: "organization", entityId: organizationId });
    revalidatePath("/settings/billing");
    return ok({ cancelled: true });
  } catch (e) {
    return actionFail(e);
  }
}
