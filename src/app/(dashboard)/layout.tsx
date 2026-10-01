import { ProfileGapsBanner } from "@/components/layout/ProfileGapsBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { InstallPwaBanner } from "@/components/layout/InstallPwaBanner";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { SystemBroadcastBanner } from "@/components/platform/SystemBroadcastBanner";
import { PaymentGraceBanner } from "@/components/billing/PaymentGraceBanner";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { EnablePushButton } from "@/components/layout/EnablePushButton";
import { SignupAttribution } from "@/components/layout/SignupAttribution";
import { TimezoneBanner } from "@/components/settings/TimezoneBanner";
import { hasPermission } from "@/lib/rbac";
import { getOrgFormat } from "@/lib/format.server";
import { isSuperAdmin, requireOrg } from "@/lib/rbac";
import { PlatformConfigService } from "@/domains/platform/configService";
import { PlanService, limitsFor, PLAN_LIMITS } from "@/domains/billing/planService";
import { PlanProvider } from "@/components/billing/PlanGate";
import { LanguageProvider } from "@/components/LanguageProvider";
import { isLang } from "@/lib/i18n";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { emailVerifications } from "@/db/schema";
import { setupStatus } from "@/lib/auth/emailVerify";
import { AccountSetupPrompt } from "@/components/layout/AccountSetupPrompt";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";
import { Wrench } from "lucide-react";

// Every dashboard page is authed and DB-backed — render per request, never prerender at build.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [superAdmin, { userId, organizationId }] = await Promise.all([isSuperAdmin(), requireOrg()]);

  // Everything below is independent — one round of queries instead of ~8 sequential ones (each paid
  // the remote DB round-trip, and every router.refresh() re-runs this layout).
  const [maintenance, billingInfo, canAdmin, canSources, orgFormat, [me]] = await Promise.all([
    superAdmin
      ? Promise.resolve({ enabled: false, message: "" })
      : PlatformConfigService.getGlobalCached<{ enabled: boolean; message: string }>("maintenance_mode", { enabled: false, message: "" }),
    BillingLifecycleService.getTenantBillingStatus(organizationId),
    hasPermission("settings.manage"),
    hasPermission("sources.manage"),
    getOrgFormat(organizationId),
    db.select({ language: users.language, firstName: users.firstName, lastName: users.lastName, email: users.email, phone: users.phone, signupMethod: users.signupMethod, emailVerifiedAt: users.emailVerifiedAt, passwordSet: users.passwordSet, googleLinkedAt: users.googleLinkedAt }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  // Maintenance mode: lock the app for everyone except super-admins (who need in to turn it off /
  // finish the work). Enforced here so enabling the toggle actually gates tenants, not just reflects
  // its own state in the console.
  if (maintenance.enabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center">
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Wrench className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Under maintenance</h1>
          <p className="text-sm text-muted-foreground">
            {maintenance.message?.trim() || "System is undergoing scheduled maintenance. Please check back shortly."}
          </p>
        </div>
      </div>
    );
  }

  const effectivePlan = billingInfo
    ? (billingInfo.status === "locked" || billingInfo.status === "free" ? "free" : billingInfo.plan)
    : undefined;
  // Depends on the billing status above, so it's the one query that waits.
  const usageStats = await PlanService.getUsageStats(organizationId, effectivePlan);
  // Admins whose device clock differs from the workspace timezone get a one-click "use my timezone" banner.
  const allowed = [canAdmin && "settings.manage", canSources && "sources.manage"].filter((p): p is string => !!p);
  const workspaceTz = orgFormat.timezone;
  const lang = isLang(me?.language) ? me.language : "en";

  // "Complete your account" prompt: only for phone-registered accounts with a login method still missing.
  const setup = me ? setupStatus({ ...me, email: me.email }) : null;
  const pendingEmail = setup?.eligible && !setup.email
    ? (await db.select({ email: emailVerifications.email }).from(emailVerifications)
        .where(and(eq(emailVerifications.userId, userId), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, new Date()))).limit(1))[0]?.email ?? null
    : null;

  return (
    <LanguageProvider lang={lang}>
    <PlanProvider paid={limitsFor(usageStats.plan) !== PLAN_LIMITS.free} plans={{ starter: PLAN_LIMITS.starter, unlimited: PLAN_LIMITS.unlimited }}>
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar isSuperAdmin={superAdmin} plan={usageStats?.plan} allowed={allowed} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <SystemBroadcastBanner currentOrg={{ id: organizationId, plan: usageStats?.plan ?? effectivePlan ?? "free" }} />
        <PaymentGraceBanner billingInfo={billingInfo} leads={usageStats.leads} />
        <ImpersonationBanner />
        <InstallPwaBanner />
        {canAdmin && <TimezoneBanner workspaceTz={workspaceTz} />}
        <EnablePushButton mode="banner" />
        {!setup?.eligible && <ProfileGapsBanner email={me?.email ?? null} phone={me?.phone ?? null} />}
        <Header 
          isSuperAdmin={superAdmin} 
          organizationId={organizationId} 
          usageStats={usageStats} 
          allowed={allowed} 
          currentUser={{
            name: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || null,
            email: me?.email || null,
            phone: me?.phone || null,
          }}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      {setup?.eligible && <AccountSetupPrompt userId={userId} status={{ email: setup.email, password: setup.password, google: setup.google }} pendingEmail={pendingEmail} />}
      <FloatingAssistant storageKey={userId} />
      <SignupAttribution userId={userId} />
    </div>
    </PlanProvider>
    </LanguageProvider>
  );
}
