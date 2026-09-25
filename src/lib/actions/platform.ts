"use server";

import { canonicalPlan } from "@/domains/billing/planNames";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/rbac";
import { PlatformService } from "@/domains/platform/service";
import { AuditService } from "@/domains/audit/service";
import { ok, fail, actionFail } from "@/lib/actions/result";

const IMPERSONATE_COOKIE = "impersonate_org";
const IMPERSONATE_READONLY_COOKIE = "impersonate_readonly";

// Validate ids the way Postgres does — any 8-4-4-4-12 hex string. z.guid() enforces RFC
// 4122 version/variant bits and so REJECTS valid Postgres uuids used as sentinels/seeds (the nil
// platform org "0000…0000" and seed orgs like "0000…0002"), which made "Open tenant" fail with
// "Invalid organization" for those tenants. guid() matches the database.
const orgIdSchema = z.string().guid();

// Platform-scoped events (broadcast, maintenance, feature flags, DLQ retry, recycle-bin purge)
// belong to no tenant. Log them under the fixed system org so they're never dropped just because
// the acting super-admin happens to have no organizationId.
const PLATFORM_ORG_ID = "00000000-0000-0000-0000-000000000000";

type Session = Awaited<ReturnType<typeof requireSuperAdmin>>;

// Every super-admin mutation and every data export is recorded with WHO did it. Tenant-scoped events
// go under the tenant (so they show in its audit trail); platform-wide ones under the system org.
async function audit(
  session: Session,
  action: string,
  opts: { organizationId?: string | null; entityType?: string; entityId?: string | null; metadata?: Record<string, unknown> } = {},
) {
  await AuditService.log({
    organizationId: opts.organizationId ?? PLATFORM_ORG_ID,
    userId: session.user.id,
    action,
    entityType: opts.entityType ?? "system",
    entityId: opts.entityId ?? null,
    metadata: { ...opts.metadata, by: "super_admin" },
  });
}

// Ids minted by the JSON-backed services (inv_…, tkt_…, coup_…, anomaly ids).
const refIdSchema = z.string().trim().min(1).max(120);
const userIdSchema = z.string().guid();
const invalid = (what: string) => fail("VALIDATION", `Invalid ${what}.`);

const planSchema = z.object({
  organizationId: orgIdSchema,
  plan: z.enum(["free", "starter", "unlimited", "pro", "business"]).transform(canonicalPlan),
  trialDays: z.number().int().positive().nullable().optional(),
  // Complimentary grant (paid plan, no trial): how long, and why. months null = no end date.
  months: z.number().int().min(1).max(60).nullable().optional(),
  note: z.string().trim().max(255).nullable().optional(),
});

export async function setOrgPlanAction(input: z.infer<typeof planSchema>) {
  const session = await requireSuperAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Choose a valid plan.");
  try {
    const row = await PlatformService.setPlan(
      parsed.data.organizationId,
      parsed.data.plan,
      parsed.data.trialDays,
      { months: parsed.data.months, note: parsed.data.note },
    );
    if (!row) return fail("NOT_FOUND", "That organization no longer exists.");
    await AuditService.log({
      organizationId: parsed.data.organizationId,
      userId: session.user.id,
      action: "platform.set_plan",
      entityType: "organization",
      entityId: parsed.data.organizationId,
      metadata: {
        plan: parsed.data.plan,
        trialDays: parsed.data.trialDays ?? null,
        trialEndsAt: row.trialEndsAt ? new Date(row.trialEndsAt).toISOString() : null,
        complimentary: row.complimentary === 1,
        complimentaryUntil: row.complimentaryUntil ? new Date(row.complimentaryUntil).toISOString() : null,
        note: row.complimentaryNote,
        by: "super_admin",
      },
    });
    revalidatePath("/admin");
    return ok({
      plan: parsed.data.plan,
      trialEndsAt: row.trialEndsAt ? new Date(row.trialEndsAt).toISOString() : null,
      complimentary: row.complimentary === 1,
      complimentaryUntil: row.complimentaryUntil ? new Date(row.complimentaryUntil).toISOString() : null,
      complimentaryNote: row.complimentaryNote,
    });
  } catch (e) {
    return actionFail(e);
  }
}

export async function setOrgSuspendedAction(organizationId: string, suspended: boolean) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
  try {
    const row = await PlatformService.setSuspended(organizationId, suspended);
    if (!row) return fail("NOT_FOUND", "That organization no longer exists.");
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: suspended ? "platform.suspend" : "platform.reactivate",
      entityType: "organization",
      entityId: organizationId,
      metadata: { by: "super_admin" },
    });
    revalidatePath("/admin");
    return ok({ suspended });
  } catch (e) {
    return actionFail(e);
  }
}

// Start impersonating a tenant: a super-admin then operates inside that org via the normal UI.
export async function impersonateOrgAction(organizationId: string, readOnly = false) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
  const org = await PlatformService.getOrg(organizationId);
  if (!org) return fail("NOT_FOUND", "That organization no longer exists.");

  const maxAgeSeconds = 60 * 60 * 4; // 4h safety cap
  const store = await cookies();
  store.set(IMPERSONATE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  });
  if (readOnly) {
    store.set(IMPERSONATE_READONLY_COOKIE, "true", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: maxAgeSeconds,
    });
  } else {
    store.delete(IMPERSONATE_READONLY_COOKIE);
  }
  await AuditService.log({
    organizationId,
    userId: session.user.id,
    action: "platform.impersonate_start",
    entityType: "organization",
    entityId: organizationId,
    metadata: {
      by: "super_admin",
      readOnly,
      maxAgeSeconds,
      expiresAt: new Date(Date.now() + maxAgeSeconds * 1000).toISOString(),
    },
  });
  return ok({ organizationId, name: org.name, readOnly });
}

export async function stopImpersonationAction() {
  const session = await requireSuperAdmin();
  const store = await cookies();
  const current = store.get(IMPERSONATE_COOKIE)?.value;
  store.delete(IMPERSONATE_COOKIE);
  store.delete(IMPERSONATE_READONLY_COOKIE);
  if (current) {
    await AuditService.log({
      organizationId: current,
      userId: session.user.id,
      action: "platform.impersonate_stop",
      entityType: "organization",
      entityId: current,
      metadata: { by: "super_admin" },
    });
  }
  revalidatePath("/", "layout");
  return ok({ stopped: true });
}

export async function searchGlobalUsersAction(query?: string) {
  await requireSuperAdmin();
  return PlatformService.searchUsers(query);
}

export async function toggleUserActiveAction(userId: string, isActive: boolean) {
  const session = await requireSuperAdmin();
  if (!userIdSchema.safeParse(userId).success) return invalid("user");
  if (session.user.id === userId && !isActive) {
    return fail("VALIDATION", "You cannot deactivate your own account.");
  }
  try {
    const updated = await PlatformService.setUserActive(userId, isActive);
    if (!updated) return fail("NOT_FOUND", "User not found.");
    if (updated.organizationId) {
      await AuditService.log({
        organizationId: updated.organizationId,
        userId: session.user.id,
        action: isActive ? "platform.user_activate" : "platform.user_deactivate",
        entityType: "user",
        entityId: userId,
        metadata: { email: updated.email, by: "super_admin" },
      });
    }
    revalidatePath("/admin");
    return ok({ userId, isActive });
  } catch (e) {
    return actionFail(e);
  }
}

// The most powerful change in the system: always audited against the target's org AND the platform
// log, and pushed to the ops channel. The last super-admin can't be removed.
export async function toggleSuperAdminAction(userId: string, isSuperAdmin: boolean) {
  const session = await requireSuperAdmin();
  if (!userIdSchema.safeParse(userId).success) return invalid("user");
  if (session.user.id === userId && !isSuperAdmin) {
    return fail("VALIDATION", "You cannot remove super-admin status from yourself.");
  }
  try {
    if (!isSuperAdmin && (await PlatformService.countSuperAdmins()) <= 1) {
      return fail("VALIDATION", "At least one super-admin must remain.");
    }
    const updated = await PlatformService.setSuperAdmin(userId, isSuperAdmin);
    if (!updated) return fail("NOT_FOUND", "User not found.");
    const action = isSuperAdmin ? "platform.super_admin_grant" : "platform.super_admin_revoke";
    const metadata = { email: updated.email, granted: isSuperAdmin };
    await audit(session, action, { entityType: "user", entityId: userId, metadata });
    if (updated.organizationId) await audit(session, action, { organizationId: updated.organizationId, entityType: "user", entityId: userId, metadata });
    const { OpsAlertService } = await import("@/domains/platform/opsAlertService");
    await OpsAlertService.dispatchAlert(
      action,
      isSuperAdmin ? "Super-admin granted" : "Super-admin revoked",
      `${updated.email} ${isSuperAdmin ? "was granted" : "lost"} platform super-admin rights (by ${session.user.email ?? session.user.id}).`,
    ).catch(() => false);
    revalidatePath("/admin");
    return ok({ userId, isSuperAdmin });
  } catch (e) {
    return actionFail(e);
  }
}

export async function setOrgSeatOverrideAction(organizationId: string, seats: number | null) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  if (seats !== null && !z.number().int().min(1).max(100_000).safeParse(seats).success) return fail("VALIDATION", "Seats must be a whole number from 1 to 100,000.");
  try {
    const res = await PlatformService.setSeatOverride(organizationId, seats);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.seat_override",
      entityType: "organization",
      entityId: organizationId,
      metadata: { seats, by: "super_admin" },
    });
    revalidatePath("/admin");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function setBroadcastAction(broadcast: {
  message: string;
  active: boolean;
  level: "info" | "warning" | "destructive";
  targetPlan?: "free" | "starter" | "unlimited" | "all" | null;
  targetOrgId?: string | null;
}) {
  const session = await requireSuperAdmin();
  const parsed = z.object({
    message: z.string().trim().max(500),
    active: z.boolean(),
    level: z.enum(["info", "warning", "destructive"]),
    targetPlan: z.enum(["free", "starter", "unlimited", "all"]).nullish(),
    targetOrgId: orgIdSchema.nullish(),
  }).safeParse(broadcast);
  if (!parsed.success) return fail("VALIDATION", "Check the broadcast message (max 500 characters) and target.");
  if (parsed.data.active && !parsed.data.message) return fail("VALIDATION", "Write a message before publishing.");
  broadcast = parsed.data;
  try {
    await PlatformService.setBroadcast(broadcast);
    await AuditService.log({
        organizationId: session.user.organizationId ?? PLATFORM_ORG_ID,
        userId: session.user.id,
        action: broadcast.active ? "platform.broadcast_publish" : "platform.broadcast_clear",
        entityType: "system",
        metadata: { ...broadcast, by: "super_admin" },
      });
    revalidatePath("/", "layout");
    return ok({ success: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function retryAllFailedDeliveriesAction() {
  const session = await requireSuperAdmin();
  try {
    const res = await PlatformService.retryAllFailedDeliveries();
    await AuditService.log({
        organizationId: session.user.organizationId ?? PLATFORM_ORG_ID,
        userId: session.user.id,
        action: "platform.bulk_dlq_retry",
        entityType: "webhook_delivery",
        metadata: { retried: res.retried, by: "super_admin" },
      });
    revalidatePath("/admin");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

// Bonus AI credits for the current month (see RevOpsService.grantCredits).
export async function grantTenantCreditsAction(organizationId: string, aiGrant: number) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  if (!z.number().int().min(1).max(100_000).safeParse(aiGrant).success) return fail("VALIDATION", "Enter a whole number of credits from 1 to 100,000.");
  try {
    const { RevOpsService } = await import("@/domains/platform/revops");
    const credits = await RevOpsService.grantCredits(organizationId, aiGrant);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.grant_credits",
      entityType: "organization",
      entityId: organizationId,
      metadata: { aiGrant, after: credits, by: "super_admin" },
    });
    revalidatePath("/admin");
    return ok(credits);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleMaintenanceModeAction(enabled: boolean, message?: string) {
  const session = await requireSuperAdmin();
  if (message && message.length > 500) return fail("VALIDATION", "Keep the notice under 500 characters.");
  try {
    const { PlatformConfigService } = await import("@/domains/platform/configService");
    await PlatformConfigService.set("maintenance_mode", {
      enabled,
      message: message || "System is undergoing scheduled maintenance. Please check back shortly.",
      updatedAt: new Date().toISOString(),
    });
    await AuditService.log({
        organizationId: session.user.organizationId ?? PLATFORM_ORG_ID,
        userId: session.user.id,
        action: enabled ? "platform.maintenance_enable" : "platform.maintenance_disable",
        entityType: "system",
        metadata: { enabled, message, by: "super_admin" },
      });
    revalidatePath("/", "layout");
    return ok({ enabled });
  } catch (e) {
    return actionFail(e);
  }
}

export async function searchDsrSubjectAction(query: string) {
  const session = await requireSuperAdmin();
  const q = typeof query === "string" ? query.trim() : "";
  if (q.length < 3 || q.length > 200) return fail("VALIDATION", "Enter at least 3 characters (email, phone or name).");
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const results = await ComplianceService.searchSubject(q);
    // A cross-tenant PII lookup — recorded, like the exports.
    await audit(session, "platform.dsr_search", { entityType: "lead", metadata: { query: q, results: results.length } });
    return ok(results);
  } catch (e) {
    return actionFail(e);
  }
}

export async function exportDsrDossierAction(leadId: string) {
  const session = await requireSuperAdmin();
  if (!userIdSchema.safeParse(leadId).success) return invalid("record");
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const dossier = await ComplianceService.exportDsrDossier(leadId);
    if (!dossier) return fail("NOT_FOUND", "Subject record not found");
    await audit(session, "platform.dsr_export", { entityType: "lead", entityId: leadId });
    return ok(dossier);
  } catch (e) {
    return actionFail(e);
  }
}

export async function executeRightToBeForgottenAction(leadId: string) {
  const session = await requireSuperAdmin();
  if (!userIdSchema.safeParse(leadId).success) return invalid("record");
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const success = await ComplianceService.executeRightToBeForgotten(leadId, session.user.id);
    if (!success) return fail("NOT_FOUND", "Subject record not found");
    revalidatePath("/admin");
    return ok({ anonymized: true, leadId });
  } catch (e) {
    return actionFail(e);
  }
}

const opsAlertSchema = z.object({
  url: z.string().trim().max(2000),
  enabled: z.boolean(),
  notifyOnSladeadline: z.boolean(),
  notifyOnDlq: z.boolean(),
  notifyOnPlanChange: z.boolean(),
  notifyOnGdpr: z.boolean(),
});

export async function saveOpsAlertConfigAction(input: z.input<typeof opsAlertSchema>) {
  const session = await requireSuperAdmin();
  const parsed = opsAlertSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Check the alert settings.");
  const config = parsed.data;
  if (config.enabled && !config.url) return fail("VALIDATION", "Enter a webhook URL to enable alerts.");
  if (config.url) {
    try {
      const { assertPublicHttpUrl } = await import("@/lib/webhooks/ssrf");
      await assertPublicHttpUrl(config.url);
    } catch (e) {
      return fail("VALIDATION", e instanceof Error ? e.message : "Invalid webhook URL.");
    }
  }
  try {
    const { OpsAlertService } = await import("@/domains/platform/opsAlertService");
    await OpsAlertService.saveConfig(config);
    await AuditService.log({
        organizationId: session.user.organizationId ?? PLATFORM_ORG_ID,
        userId: session.user.id,
        action: "platform.save_ops_webhook",
        entityType: "system",
        metadata: { enabled: config.enabled, urlSet: !!config.url, by: "super_admin" },
      });
    revalidatePath("/admin");
    return ok(config);
  } catch (e) {
    return actionFail(e);
  }
}

export async function testOpsAlertAction() {
  await requireSuperAdmin();
  try {
    const { OpsAlertService } = await import("@/domains/platform/opsAlertService");
    const res = await OpsAlertService.sendTestPing();
    if (!res.ok) return fail("SERVER", res.message);
    return ok({ message: res.message });
  } catch (e) {
    return actionFail(e);
  }
}

export async function listBillingLifecycleAction() {
  await requireSuperAdmin();
  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    const fleet = await BillingLifecycleService.listFleetBillingStatus();
    return ok(fleet);
  } catch (e) {
    return actionFail(e);
  }
}

export async function extendGracePeriodAction(organizationId: string, days = 7) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  if (!z.number().int().min(1).max(90).safeParse(days).success) return fail("VALIDATION", "Grace extension must be 1–90 days.");
  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    const updated = await BillingLifecycleService.extendGracePeriod(organizationId, days);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.extend_grace_period",
      entityType: "organization",
      entityId: organizationId,
      metadata: { days, graceEndsAt: updated.gracePeriodEndsAt },
    });
    revalidatePath("/admin");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function markTenantManuallyPaidAction(organizationId: string, days = 30) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  if (!z.number().int().min(1).max(366).safeParse(days).success) return fail("VALIDATION", "Paid period must be 1–366 days.");
  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    const updated = await BillingLifecycleService.markManuallyPaid(organizationId, days);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.mark_manually_paid",
      entityType: "organization",
      entityId: organizationId,
      metadata: { days, manualPaidUntil: updated.manualPaidUntil },
    });
    revalidatePath("/admin");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function sendDunningNoticeAction(organizationId: string) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    const status = await BillingLifecycleService.getTenantBillingStatus(organizationId);
    if (!status) return fail("NOT_FOUND", "Organization not found");
    const expiry = status.gracePeriodEndsAt ? new Date(status.gracePeriodEndsAt) : new Date(Date.now() + 7 * 86400000);
    await BillingLifecycleService.sendDunningEmail(
      organizationId,
      status.orgName,
      status.plan,
      expiry,
      status.failureReason || "Payment past due"
    );
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.send_dunning_notice",
      entityType: "organization",
      entityId: organizationId,
    });
    return ok({ sent: true });
  } catch (e) {
    return actionFail(e);
  }
}

const invoiceSchema = z.object({
  orgId: orgIdSchema,
  plan: z.string().trim().min(1).max(50),
  amount: z.number().positive("Amount must be more than zero.").max(10_000_000),
  status: z.enum(["paid", "issued"]).optional(),
  // 15-char GSTIN: 2-digit state code, PAN, entity, Z, checksum.
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN.").nullish().or(z.literal("")),
});

export async function generateInvoiceAction(params: z.input<typeof invoiceSchema>) {
  const session = await requireSuperAdmin();
  const parsed = invoiceSchema.safeParse(params);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the invoice details.");
  try {
    const { InvoiceService } = await import("@/domains/billing/invoiceService");
    const inv = await InvoiceService.generateInvoice({ ...parsed.data, gstin: parsed.data.gstin || null }, session.user.id);
    revalidatePath("/admin");
    return ok(inv);
  } catch (e) {
    return actionFail(e);
  }
}

export async function voidInvoiceAction(id: string) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(id).success) return invalid("invoice");
  try {
    const { InvoiceService } = await import("@/domains/billing/invoiceService");
    const inv = await InvoiceService.voidInvoice(id, session.user.id);
    if (!inv) return fail("NOT_FOUND", "Invoice not found");
    revalidatePath("/admin");
    return ok(inv);
  } catch (e) {
    return actionFail(e);
  }
}

export async function issueCreditNoteAction(invoiceId: string, reason?: string) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(invoiceId).success) return invalid("invoice");
  if (reason && reason.length > 500) return fail("VALIDATION", "Keep the reason under 500 characters.");
  try {
    const { InvoiceService } = await import("@/domains/billing/invoiceService");
    const creditNote = await InvoiceService.issueCreditNote(invoiceId, reason, session.user.id);
    if (!creditNote) return fail("NOT_FOUND", "Original invoice not found");
    revalidatePath("/admin");
    return ok(creditNote);
  } catch (e) {
    return actionFail(e);
  }
}


// --- Coupons & Promo Codes ---
const couponSchema = z.object({
  code: z.string().trim().min(3, "Code must be 3–30 characters.").max(30, "Code must be 3–30 characters.").regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _ only."),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive("Discount must be more than zero.").max(1_000_000),
  plans: z.array(z.string().trim().min(1)).max(10).optional(),
  maxRedemptions: z.number().int().min(0).max(1_000_000).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullish().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).or(z.literal("")),
  razorpayOfferId: z.string().trim().max(100).nullish(),
}).refine((c) => c.discountType !== "percent" || c.discountValue <= 100, { message: "A percentage discount can't exceed 100%." });

export async function createCouponAction(input: z.input<typeof couponSchema>) {
  const session = await requireSuperAdmin();
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the coupon details.");
  try {
    const { CouponService } = await import("@/domains/billing/couponService");
    const coupon = await CouponService.create({ ...parsed.data, expiresAt: parsed.data.expiresAt || null });
    await audit(session, "platform.coupon_create", { entityType: "coupon", entityId: coupon.id, metadata: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue } });
    revalidatePath("/admin");
    return ok(coupon);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleCouponAction(id: string, active: boolean) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(id).success) return invalid("coupon");
  try {
    const { CouponService } = await import("@/domains/billing/couponService");
    const coupon = await CouponService.toggle(id, active);
    if (!coupon) return fail("NOT_FOUND", "Coupon not found");
    await audit(session, active ? "platform.coupon_enable" : "platform.coupon_disable", { entityType: "coupon", entityId: id, metadata: { code: coupon.code } });
    revalidatePath("/admin");
    return ok(coupon);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteCouponAction(id: string) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(id).success) return invalid("coupon");
  try {
    const { CouponService } = await import("@/domains/billing/couponService");
    const deleted = await CouponService.delete(id);
    if (!deleted) return fail("NOT_FOUND", "Coupon not found");
    await audit(session, "platform.coupon_delete", { entityType: "coupon", entityId: id });
    revalidatePath("/admin");
    return ok({ deleted });
  } catch (e) {
    return actionFail(e);
  }
}


// --- Support Desk ---
export async function replySupportTicketAction(ticketId: string, body: string) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(ticketId).success) return invalid("ticket");
  const text = typeof body === "string" ? body.trim() : "";
  if (!text || text.length > 5000) return fail("VALIDATION", "Write a reply (up to 5,000 characters).");
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const senderName = session.user.name || session.user.email || "Platform SuperAdmin";
    const ticket = await SupportTicketService.reply(ticketId, "superadmin", senderName, text);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found");
    await audit(session, "platform.support_reply", { organizationId: ticket.orgId, entityType: "support_ticket", entityId: ticketId });
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateSupportTicketStatusAction(ticketId: string, status: "open" | "in_progress" | "resolved") {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(ticketId).success) return invalid("ticket");
  if (!z.enum(["open", "in_progress", "resolved"]).safeParse(status).success) return invalid("status");
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const ticket = await SupportTicketService.updateStatus(ticketId, status);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found");
    await audit(session, "platform.support_status", { organizationId: ticket.orgId, entityType: "support_ticket", entityId: ticketId, metadata: { status } });
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}


// --- Session Killswitch ---
export async function revokeUserSessionsAction(userId: string) {
  const session = await requireSuperAdmin();
  if (!userIdSchema.safeParse(userId).success) return invalid("user");
  try {
    const { SessionService } = await import("@/domains/platform/sessionService");
    const revokedAt = await SessionService.revokeUserSessions(userId, session.user.id);
    revalidatePath("/admin");
    return ok({ revokedAt });
  } catch (e) {
    return actionFail(e);
  }
}

export async function revokeOrgSessionsAction(orgId: string) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(orgId).success) return invalid("organization");
  try {
    const { SessionService } = await import("@/domains/platform/sessionService");
    const revokedAt = await SessionService.revokeOrgSessions(orgId, session.user.id);
    revalidatePath("/admin");
    return ok({ revokedAt });
  } catch (e) {
    return actionFail(e);
  }
}

// --- 1-Click Platform CSV Exporters ---
export async function exportPlatformCsvAction(type: "tenants" | "financial" | "churn") {
  const session = await requireSuperAdmin();
  if (!z.enum(["tenants", "financial", "churn"]).safeParse(type).success) return invalid("export");
  try {
    const { PlatformExportService } = await import("@/domains/platform/exportService");
    let csv = "";
    if (type === "tenants") csv = await PlatformExportService.exportTenantsDirectoryCsv();
    else if (type === "financial") csv = await PlatformExportService.exportFinancialLedgerCsv();
    else if (type === "churn") csv = await PlatformExportService.exportChurnRiskCsv();
    await audit(session, "platform.export_csv", { metadata: { type, rows: Math.max(0, csv.split("\n").length - 1) } });
    return ok({ csv, filename: `ridhzo_${type}_export_${new Date().toISOString().slice(0, 10)}.csv` });
  } catch (e) {
    return actionFail(e);
  }
}


// --- Tenant Audit Trail & Fleet API Keys ---
export async function getTenantAuditLogsAction(organizationId: string) {
  await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  try {
    const logs = await PlatformService.getTenantAuditLogs(organizationId, 50);
    return ok(logs);
  } catch (e) {
    return actionFail(e);
  }
}

export async function getPlatformActivityAction() {
  await requireSuperAdmin();
  try {
    const activity = await PlatformService.getPlatformActivity(50);
    return ok(activity);
  } catch (e) {
    return actionFail(e);
  }
}

export async function revokeFleetApiKeyAction(id: string) {
  const session = await requireSuperAdmin();
  if (!userIdSchema.safeParse(id).success) return invalid("API key");
  try {
    const revoked = await PlatformService.revokeFleetApiKey(id);
    if (!revoked) return fail("NOT_FOUND", "API key not found.");
    await audit(session, "platform.api_key_revoke", { organizationId: revoked.organizationId, entityType: "api_key", entityId: id, metadata: { name: revoked.name } });
    revalidatePath("/admin");
    return ok({ revoked: true });
  } catch (e) {
    return actionFail(e);
  }
}


// --- Executive Digest ---
const digestSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  recipients: z.array(z.string().trim().email("Enter valid recipient emails.")).max(20).optional(),
});

export async function saveExecutiveDigestConfigAction(config: z.input<typeof digestSchema>) {
  const session = await requireSuperAdmin();
  const parsed = digestSchema.safeParse(config);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the digest settings.");
  try {
    const { ExecutiveDigestService } = await import("@/domains/platform/executiveDigestService");
    const updated = await ExecutiveDigestService.saveConfig(parsed.data);
    await audit(session, "platform.digest_config", { metadata: { enabled: updated.enabled, frequency: updated.frequency, recipients: updated.recipients?.length ?? 0 } });
    revalidatePath("/admin");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function sendTestExecutiveDigestAction(targetEmail: string) {
  await requireSuperAdmin();
  if (!z.string().trim().email().safeParse(targetEmail).success) return fail("VALIDATION", "Enter a valid email.");
  try {
    const { ExecutiveDigestService } = await import("@/domains/platform/executiveDigestService");
    await ExecutiveDigestService.sendTestDigest(targetEmail);
    return ok({ success: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function triggerExecutiveDigestAction() {
  const session = await requireSuperAdmin();
  try {
    const { ExecutiveDigestService } = await import("@/domains/platform/executiveDigestService");
    const res = await ExecutiveDigestService.sendDigest();
    await audit(session, "platform.digest_send");
    revalidatePath("/admin");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

// --- Anomaly & Abuse Detection ---
export async function listAnomaliesAction() {
  await requireSuperAdmin();
  try {
    const { AnomalyDetectionService } = await import("@/domains/platform/anomalyDetectionService");
    const anomalies = await AnomalyDetectionService.scanAndCacheAnomalies();
    return ok(anomalies);
  } catch (e) {
    return actionFail(e);
  }
}

export async function resolveAnomalyAction(id: string, action: "resolve" | "dismiss") {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(id).success || !z.enum(["resolve", "dismiss"]).safeParse(action).success) return invalid("anomaly");
  try {
    const { AnomalyDetectionService } = await import("@/domains/platform/anomalyDetectionService");
    await AnomalyDetectionService.resolveAnomaly(id, action, session.user.id);
    revalidatePath("/admin");
    return ok({ success: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function remediateAnomalyAction(id: string) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(id).success) return invalid("anomaly");
  try {
    const { AnomalyDetectionService } = await import("@/domains/platform/anomalyDetectionService");
    const result = await AnomalyDetectionService.executeRemediation(id, session.user.id);
    revalidatePath("/admin");
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

export async function assignSupportTicketAction(ticketId: string, assignedTo: string | null) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(ticketId).success) return invalid("ticket");
  if (assignedTo !== null && !z.string().trim().min(1).max(255).safeParse(assignedTo).success) return invalid("assignee");
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const ticket = await SupportTicketService.assignTicket(ticketId, assignedTo);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found");
    await audit(session, "platform.support_assign", { organizationId: ticket.orgId, entityType: "support_ticket", entityId: ticketId, metadata: { assignedTo } });
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

export async function addSupportTicketNoteAction(ticketId: string, noteBody: string) {
  const session = await requireSuperAdmin();
  if (!refIdSchema.safeParse(ticketId).success) return invalid("ticket");
  const text = typeof noteBody === "string" ? noteBody.trim() : "";
  if (!text || text.length > 5000) return fail("VALIDATION", "Write a note (up to 5,000 characters).");
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const authorName = session.user.name || session.user.email || "SuperAdmin";
    const ticket = await SupportTicketService.addInternalNote(ticketId, authorName, text);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found");
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

const capiSchema = z.object({
  pixelId: z.string().trim().regex(/^\d{0,20}$/, "Pixel ID is numeric.").optional(),
  accessToken: z.string().trim().max(1000).optional(), // blank = keep the stored token
  testEventCode: z.string().trim().max(50).optional(),
  enabled: z.boolean().optional(),
});

// The access token is write-only: never sent back to the browser (see MetaCapiService.publicConfig).
export async function saveCapiConfigAction(input: z.input<typeof capiSchema>) {
  const session = await requireSuperAdmin();
  const parsed = capiSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the Conversions API settings.");
  try {
    const { MetaCapiService } = await import("@/domains/platform/capiService");
    const { accessToken, ...rest } = parsed.data;
    const updated = await MetaCapiService.saveConfig({ ...rest, ...(accessToken ? { accessToken } : {}) });
    await audit(session, "platform.capi_config", { metadata: { enabled: updated.enabled, pixelId: updated.pixelId, tokenChanged: !!accessToken } });
    revalidatePath("/admin");
    return ok(MetaCapiService.publicConfig(updated));
  } catch (e) {
    return actionFail(e);
  }
}

export async function listCapiLogsAction(limit = 50) {
  await requireSuperAdmin();
  try {
    const { MetaCapiService } = await import("@/domains/platform/capiService");
    const logs = await MetaCapiService.listLogs(limit);
    return ok(logs);
  } catch (e) {
    return actionFail(e);
  }
}

export async function exportTenantDossierAction(organizationId: string) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
  try {
    const dossier = await PlatformService.exportTenantDossier(organizationId);
    if (!dossier) return fail("NOT_FOUND", "Organization not found.");
    await audit(session, "platform.tenant_dossier_export", { organizationId, entityType: "organization", entityId: organizationId, metadata: { leads: dossier.leads.length, truncated: dossier.truncated ?? false } });
    return ok(dossier);
  } catch (e) {
    return actionFail(e);
  }
}

export async function hardDeleteTenantAction(organizationId: string, confirmation: string) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
  try {
    const res = await PlatformService.hardDeleteTenant(organizationId, confirmation, session.user.id);
    if (!res.success) {
      return fail("VALIDATION", res.message ?? "Hard delete rejected.");
    }
    revalidatePath("/admin");
    return ok({ success: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function triggerSuspensionRetentionScanAction() {
  const session = await requireSuperAdmin();
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const result = await ComplianceService.processSuspensionRetention();
    await audit(session, "platform.retention_scan", { metadata: result });
    revalidatePath("/admin");
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

export async function replayAuthFailedLeadsAction(organizationId: string, pageId: string) {
  const session = await requireSuperAdmin();
  if (!orgIdSchema.safeParse(organizationId).success) return invalid("organization");
  if (!pageId || !/^\d{1,30}$/.test(pageId)) return fail("VALIDATION", "Page ID is required.");
  try {
    const { db } = await import("@/db");
    const { webhookEvents, leadSources } = await import("@/db/schema");
    const { and, eq, sql, inArray } = await import("drizzle-orm");

    // webhook_events carry no org: only replay a Page that belongs to THIS tenant's sources, so an
    // operator on one tenant's page can't requeue (and mis-attribute) another tenant's events.
    const [owned] = await db
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(and(eq(leadSources.organizationId, organizationId), sql`${leadSources.config}->>'pageId' = ${pageId}`))
      .limit(1);
    if (!owned) return fail("VALIDATION", "That Facebook Page isn't connected to this workspace.");

    const rows = await db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, "facebook"),
          eq(webhookEvents.status, "failed"),
          sql`${webhookEvents.payload}->>'page_id' = ${pageId}`,
          sql`${webhookEvents.errorLog}->>'reason' = 'auth_error_needs_reconnect'`,
        ),
      );

    if (rows.length === 0) {
      return ok({ replayedCount: 0, message: "No failed auth events found for this page." });
    }

    const { ingestionQueue } = await import("@/lib/jobs/workers/ingestionWorker");
    await db.update(webhookEvents).set({ status: "pending", errorLog: null }).where(inArray(webhookEvents.id, rows.map((r) => r.id)));
    await ingestionQueue.addBulk(rows.map((r) => ({ name: `ingest-fb-replay-${r.id}`, data: { webhookEventId: r.id, provider: "facebook" } })));

    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.fb_leads_replay",
      entityType: "organization",
      entityId: organizationId,
      metadata: { pageId, replayedCount: rows.length, by: "super_admin" },
    });

    revalidatePath(`/admin/tenant/${organizationId}`);
    return ok({ replayedCount: rows.length, message: `Requeued ${rows.length} failed Facebook lead events for processing.` });
  } catch (e) {
    return actionFail(e);
  }
}




