"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/rbac";
import { PlatformService } from "@/domains/platform/service";
import { AuditService } from "@/domains/audit/service";
import { ok, fail, actionFail } from "@/lib/actions/result";

const IMPERSONATE_COOKIE = "impersonate_org";
const IMPERSONATE_READONLY_COOKIE = "impersonate_readonly";

const planSchema = z.object({
  organizationId: z.string().uuid(),
  plan: z.enum(["free", "pro", "business"]),
  trialDays: z.number().int().positive().nullable().optional(),
});

export async function setOrgPlanAction(input: z.infer<typeof planSchema>) {
  const session = await requireSuperAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Choose a valid plan.");
  try {
    const row = await PlatformService.setPlan(
      parsed.data.organizationId,
      parsed.data.plan,
      parsed.data.trialDays
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
        by: "super_admin",
      },
    });
    revalidatePath("/admin");
    return ok({
      plan: parsed.data.plan,
      trialEndsAt: row.trialEndsAt ? new Date(row.trialEndsAt).toISOString() : null,
    });
  } catch (e) {
    return actionFail(e);
  }
}

export async function setOrgSuspendedAction(organizationId: string, suspended: boolean) {
  const session = await requireSuperAdmin();
  if (!z.string().uuid().safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
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
  if (!z.string().uuid().safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
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

export async function toggleSuperAdminAction(userId: string, isSuperAdmin: boolean) {
  const session = await requireSuperAdmin();
  if (session.user.id === userId && !isSuperAdmin) {
    return fail("VALIDATION", "You cannot remove super-admin status from yourself.");
  }
  try {
    const updated = await PlatformService.setSuperAdmin(userId, isSuperAdmin);
    if (!updated) return fail("NOT_FOUND", "User not found.");
    revalidatePath("/admin");
    return ok({ userId, isSuperAdmin });
  } catch (e) {
    return actionFail(e);
  }
}

export async function setOrgSeatOverrideAction(organizationId: string, seats: number | null) {
  const session = await requireSuperAdmin();
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
  targetPlan?: "free" | "pro" | "business" | "all" | null;
  targetOrgId?: string | null;
}) {
  const session = await requireSuperAdmin();
  try {
    await PlatformService.setBroadcast(broadcast);
    if (session.user.organizationId) {
      await AuditService.log({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        action: broadcast.active ? "platform.broadcast_publish" : "platform.broadcast_clear",
        entityType: "system",
        metadata: { ...broadcast, by: "super_admin" },
      });
    }
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
    if (session.user.organizationId) {
      await AuditService.log({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        action: "platform.bulk_dlq_retry",
        entityType: "webhook_delivery",
        metadata: { retried: res.retried, by: "super_admin" },
      });
    }
    revalidatePath("/admin");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function purgeRecycleBinAction() {
  const session = await requireSuperAdmin();
  try {
    const res = await PlatformService.purgeRecycleBin();
    if (session.user.organizationId) {
      await AuditService.log({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        action: "platform.recycle_bin_purge",
        entityType: "lead",
        metadata: { purgedCount: res.purgedCount, by: "super_admin" },
      });
    }
    revalidatePath("/admin");
    return ok(res);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleFeatureFlagAction(key: string, enabled: boolean) {
  const session = await requireSuperAdmin();
  try {
    const { FeatureFlagService } = await import("@/domains/platform/featureFlags");
    const flag = await FeatureFlagService.toggle(key, enabled);
    if (!flag) return fail("NOT_FOUND", "Feature flag not found");
    if (session.user.organizationId) {
      await AuditService.log({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        action: "platform.toggle_feature_flag",
        entityType: "system",
        metadata: { key, enabled, by: "super_admin" },
      });
    }
    revalidatePath("/admin");
    return ok(flag);
  } catch (e) {
    return actionFail(e);
  }
}

export async function grantTenantCreditsAction(organizationId: string, aiGrant: number, whatsappGrant: number) {
  const session = await requireSuperAdmin();
  try {
    const { RevOpsService } = await import("@/domains/platform/revops");
    const credits = await RevOpsService.grantCredits(organizationId, aiGrant, whatsappGrant);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.grant_credits",
      entityType: "organization",
      entityId: organizationId,
      metadata: { aiGrant, whatsappGrant, current: credits, by: "super_admin" },
    });
    revalidatePath("/admin");
    return ok(credits);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleMaintenanceModeAction(enabled: boolean, message?: string) {
  const session = await requireSuperAdmin();
  try {
    const { PlatformConfigService } = await import("@/domains/platform/configService");
    await PlatformConfigService.set("maintenance_mode", {
      enabled,
      message: message || "System is undergoing scheduled maintenance. Please check back shortly.",
      updatedAt: new Date().toISOString(),
    });
    if (session.user.organizationId) {
      await AuditService.log({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        action: enabled ? "platform.maintenance_enable" : "platform.maintenance_disable",
        entityType: "system",
        metadata: { enabled, message, by: "super_admin" },
      });
    }
    revalidatePath("/", "layout");
    return ok({ enabled });
  } catch (e) {
    return actionFail(e);
  }
}

export async function searchDsrSubjectAction(query: string) {
  await requireSuperAdmin();
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const results = await ComplianceService.searchSubject(query);
    return ok(results);
  } catch (e) {
    return actionFail(e);
  }
}

export async function exportDsrDossierAction(leadId: string) {
  await requireSuperAdmin();
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const dossier = await ComplianceService.exportDsrDossier(leadId);
    if (!dossier) return fail("NOT_FOUND", "Subject record not found");
    return ok(dossier);
  } catch (e) {
    return actionFail(e);
  }
}

export async function executeRightToBeForgottenAction(leadId: string) {
  const session = await requireSuperAdmin();
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

export async function saveOpsAlertConfigAction(config: any) {
  const session = await requireSuperAdmin();
  try {
    const { OpsAlertService } = await import("@/domains/platform/opsAlertService");
    await OpsAlertService.saveConfig(config);
    if (session.user.organizationId) {
      await AuditService.log({
        organizationId: session.user.organizationId,
        userId: session.user.id,
        action: "platform.save_ops_webhook",
        entityType: "system",
        metadata: { enabled: config.enabled, urlSet: !!config.url, by: "super_admin" },
      });
    }
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

export async function getTenantSecurityPolicyAction(organizationId: string) {
  await requireSuperAdmin();
  try {
    const { SecurityPolicyService } = await import("@/domains/platform/securityPolicyService");
    const policy = await SecurityPolicyService.getPolicy(organizationId);
    return ok(policy);
  } catch (e) {
    return actionFail(e);
  }
}

export async function setTenantSecurityPolicyAction(
  organizationId: string,
  policy: { allowedCidrs?: string[]; enforceMfa?: boolean; sessionMaxAgeHours?: number }
) {
  const session = await requireSuperAdmin();
  try {
    const { SecurityPolicyService } = await import("@/domains/platform/securityPolicyService");
    const updated = await SecurityPolicyService.setPolicy(organizationId, policy);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.set_security_policy",
      entityType: "organization",
      entityId: organizationId,
      metadata: { policy: updated, by: "super_admin" },
    });
    revalidatePath("/admin");
    return ok(updated);
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

export async function simulatePaymentFailureAction(organizationId: string, reason = "Card declined (Manual Test Simulation)") {
  const session = await requireSuperAdmin();
  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    await BillingLifecycleService.handlePaymentFailure(organizationId, reason);
    await AuditService.log({
      organizationId,
      userId: session.user.id,
      action: "platform.simulate_payment_failure",
      entityType: "organization",
      entityId: organizationId,
      metadata: { reason },
    });
    revalidatePath("/admin");
    return ok({ simulated: true });
  } catch (e) {
    return actionFail(e);
  }
}

// --- Tax Invoices ---
export async function generateInvoiceAction(params: {
  orgId: string;
  plan: string;
  amount: number;
  status?: "paid" | "issued";
  gstin?: string | null;
}) {
  await requireSuperAdmin();
  try {
    const { InvoiceService } = await import("@/domains/billing/invoiceService");
    const inv = await InvoiceService.generateInvoice(params);
    revalidatePath("/admin");
    return ok(inv);
  } catch (e) {
    return actionFail(e);
  }
}

export async function voidInvoiceAction(id: string) {
  await requireSuperAdmin();
  try {
    const { InvoiceService } = await import("@/domains/billing/invoiceService");
    const inv = await InvoiceService.voidInvoice(id);
    if (!inv) return fail("NOT_FOUND", "Invoice not found");
    revalidatePath("/admin");
    return ok(inv);
  } catch (e) {
    return actionFail(e);
  }
}

export async function issueCreditNoteAction(invoiceId: string, reason?: string) {
  await requireSuperAdmin();
  try {
    const { InvoiceService } = await import("@/domains/billing/invoiceService");
    const creditNote = await InvoiceService.issueCreditNote(invoiceId, reason);
    if (!creditNote) return fail("NOT_FOUND", "Original invoice not found");
    revalidatePath("/admin");
    return ok(creditNote);
  } catch (e) {
    return actionFail(e);
  }
}

// --- Coupons & Promo Codes ---
export async function createCouponAction(input: {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  plans?: string[];
  maxRedemptions?: number;
  expiresAt?: string | null;
}) {
  await requireSuperAdmin();
  try {
    const { CouponService } = await import("@/domains/billing/couponService");
    const coupon = await CouponService.create(input);
    revalidatePath("/admin");
    return ok(coupon);
  } catch (e) {
    return actionFail(e);
  }
}

export async function toggleCouponAction(id: string, active: boolean) {
  await requireSuperAdmin();
  try {
    const { CouponService } = await import("@/domains/billing/couponService");
    const coupon = await CouponService.toggle(id, active);
    if (!coupon) return fail("NOT_FOUND", "Coupon not found");
    revalidatePath("/admin");
    return ok(coupon);
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteCouponAction(id: string) {
  await requireSuperAdmin();
  try {
    const { CouponService } = await import("@/domains/billing/couponService");
    const deleted = await CouponService.delete(id);
    revalidatePath("/admin");
    return ok({ deleted });
  } catch (e) {
    return actionFail(e);
  }
}

// --- Support Desk ---
export async function replySupportTicketAction(ticketId: string, body: string) {
  const session = await requireSuperAdmin();
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const senderName = session.user.name || session.user.email || "Platform SuperAdmin";
    const ticket = await SupportTicketService.reply(ticketId, "superadmin", senderName, body);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found");
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateSupportTicketStatusAction(ticketId: string, status: "open" | "in_progress" | "resolved") {
  await requireSuperAdmin();
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const ticket = await SupportTicketService.updateStatus(ticketId, status);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found");
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

// --- Session Killswitch ---
export async function revokeUserSessionsAction(userId: string) {
  const session = await requireSuperAdmin();
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
  await requireSuperAdmin();
  try {
    const { PlatformExportService } = await import("@/domains/platform/exportService");
    let csv = "";
    if (type === "tenants") csv = await PlatformExportService.exportTenantsDirectoryCsv();
    else if (type === "financial") csv = await PlatformExportService.exportFinancialLedgerCsv();
    else if (type === "churn") csv = await PlatformExportService.exportChurnRiskCsv();
    return ok({ csv, filename: `ridhzo_${type}_export_${new Date().toISOString().slice(0, 10)}.csv` });
  } catch (e) {
    return actionFail(e);
  }
}

// --- Tenant Audit Trail & Fleet API Keys ---
export async function getTenantAuditLogsAction(organizationId: string) {
  await requireSuperAdmin();
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
  await requireSuperAdmin();
  try {
    const revoked = await PlatformService.revokeFleetApiKey(id);
    revalidatePath("/admin");
    return ok({ revoked });
  } catch (e) {
    return actionFail(e);
  }
}

// --- Executive Digest ---
export async function saveExecutiveDigestConfigAction(config: {
  enabled?: boolean;
  frequency?: "daily" | "weekly";
  recipients?: string[];
}) {
  await requireSuperAdmin();
  try {
    const { ExecutiveDigestService } = await import("@/domains/platform/executiveDigestService");
    const updated = await ExecutiveDigestService.saveConfig(config);
    revalidatePath("/admin");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function sendTestExecutiveDigestAction(targetEmail: string) {
  await requireSuperAdmin();
  try {
    const { ExecutiveDigestService } = await import("@/domains/platform/executiveDigestService");
    await ExecutiveDigestService.sendTestDigest(targetEmail);
    return ok({ success: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function triggerExecutiveDigestAction() {
  await requireSuperAdmin();
  try {
    const { ExecutiveDigestService } = await import("@/domains/platform/executiveDigestService");
    const res = await ExecutiveDigestService.sendDigest();
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
  await requireSuperAdmin();
  try {
    const { AnomalyDetectionService } = await import("@/domains/platform/anomalyDetectionService");
    await AnomalyDetectionService.resolveAnomaly(id, action);
    revalidatePath("/admin");
    return ok({ success: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function remediateAnomalyAction(id: string) {
  const session = await requireSuperAdmin();
  try {
    const { AnomalyDetectionService } = await import("@/domains/platform/anomalyDetectionService");
    const result = await AnomalyDetectionService.executeRemediation(id, session.user.id);
    revalidatePath("/admin");
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

// --- Per-Tenant Feature Overrides ---
export async function setTenantFlagOverrideAction(key: string, organizationId: string, enabled: boolean) {
  await requireSuperAdmin();
  try {
    const { FeatureFlagService } = await import("@/domains/platform/featureFlags");
    const flag = await FeatureFlagService.setTenantOverride(key, organizationId, enabled);
    revalidatePath("/admin");
    return ok(flag);
  } catch (e) {
    return actionFail(e);
  }
}

// --- Support Triage & Internal Notes ---
export async function assignSupportTicketAction(ticketId: string, assignedTo: string | null) {
  await requireSuperAdmin();
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const ticket = await SupportTicketService.assignTicket(ticketId, assignedTo);
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

export async function addSupportTicketNoteAction(ticketId: string, noteBody: string) {
  const session = await requireSuperAdmin();
  try {
    const { SupportTicketService } = await import("@/domains/platform/supportService");
    const authorName = session.user.name || session.user.email || "SuperAdmin";
    const ticket = await SupportTicketService.addInternalNote(ticketId, authorName, noteBody);
    revalidatePath("/admin");
    return ok(ticket);
  } catch (e) {
    return actionFail(e);
  }
}

// --- Custom Domains ---
export async function registerCustomDomainAction(orgId: string, domain: string) {
  await requireSuperAdmin();
  try {
    const { CustomDomainService } = await import("@/domains/platform/customDomainService");
    const record = await CustomDomainService.registerDomain(orgId, domain);
    revalidatePath("/admin");
    return ok(record);
  } catch (e) {
    return actionFail(e);
  }
}

export async function verifyCustomDomainAction(id: string) {
  await requireSuperAdmin();
  try {
    const { CustomDomainService } = await import("@/domains/platform/customDomainService");
    const record = await CustomDomainService.verifyDomain(id);
    revalidatePath("/admin");
    return ok(record);
  } catch (e) {
    return actionFail(e);
  }
}

export async function removeCustomDomainAction(id: string) {
  await requireSuperAdmin();
  try {
    const { CustomDomainService } = await import("@/domains/platform/customDomainService");
    const removed = await CustomDomainService.removeDomain(id);
    revalidatePath("/admin");
    return ok({ removed });
  } catch (e) {
    return actionFail(e);
  }
}

// --- Meta Conversions API (CAPI) & Campaign Analytics ---
export async function saveCapiConfigAction(input: {
  pixelId?: string;
  accessToken?: string;
  testEventCode?: string;
  enabled?: boolean;
}) {
  await requireSuperAdmin();
  try {
    const { MetaCapiService } = await import("@/domains/platform/capiService");
    const updated = await MetaCapiService.saveConfig(input);
    revalidatePath("/admin");
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function sendTestCapiPingAction() {
  const session = await requireSuperAdmin();
  try {
    const { MetaCapiService } = await import("@/domains/platform/capiService");
    const res = await MetaCapiService.sendEvent({
      eventName: "CompleteRegistration",
      email: session.user.email || "superadmin@ridhzo.com",
      eventSourceUrl: "https://ridhzo.com/admin?test=capi",
    });
    revalidatePath("/admin");
    return ok(res);
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
  await requireSuperAdmin();
  if (!z.string().uuid().safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
  try {
    const dossier = await PlatformService.exportTenantDossier(organizationId);
    if (!dossier) return fail("NOT_FOUND", "Organization not found.");
    return ok(dossier);
  } catch (e) {
    return actionFail(e);
  }
}

export async function hardDeleteTenantAction(organizationId: string, confirmation: string) {
  const session = await requireSuperAdmin();
  if (!z.string().uuid().safeParse(organizationId).success) return fail("VALIDATION", "Invalid organization.");
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
  await requireSuperAdmin();
  try {
    const { ComplianceService } = await import("@/domains/platform/complianceService");
    const result = await ComplianceService.processSuspensionRetention();
    revalidatePath("/admin");
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

export async function triggerTrialDowngradeScanAction() {
  await requireSuperAdmin();
  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    const result = await BillingLifecycleService.downgradeExpiredTrials();
    revalidatePath("/admin");
    return ok(result);
  } catch (e) {
    return actionFail(e);
  }
}

export async function replayAuthFailedLeadsAction(organizationId: string, pageId: string) {
  const session = await requireSuperAdmin();
  if (!pageId) return fail("VALIDATION", "Page ID is required.");
  try {
    const { db } = await import("@/db");
    const { webhookEvents } = await import("@/db/schema");
    const { and, eq, sql } = await import("drizzle-orm");

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
    for (const r of rows) {
      await db.update(webhookEvents).set({ status: "pending", errorLog: null }).where(eq(webhookEvents.id, r.id));
      await ingestionQueue.add(`ingest-fb-replay-${r.id}`, { webhookEventId: r.id, provider: "facebook" });
    }

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




