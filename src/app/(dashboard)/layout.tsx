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
import { eq } from "drizzle-orm";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";
import { Wrench } from "lucide-react";

// Every dashboard page is authed and DB-backed — render per request, never prerender at build.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const superAdmin = await isSuperAdmin();
  const { userId, organizationId } = await requireOrg();

  // Maintenance mode: lock the app for everyone except super-admins (who need in to turn it off /
  // finish the work). Enforced here so enabling the toggle actually gates tenants, not just reflects
  // its own state in the console.
  if (!superAdmin) {
    const maintenance = await PlatformConfigService.getGlobalCached<{ enabled: boolean; message: string }>(
      "maintenance_mode",
      { enabled: false, message: "" },
    );
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
  }

  const billingInfo = await BillingLifecycleService.getTenantBillingStatus(organizationId);
  const effectivePlan = billingInfo
    ? (billingInfo.status === "locked" || billingInfo.status === "free" ? "free" : billingInfo.plan)
    : undefined;
  const usageStats = await PlanService.getUsageStats(organizationId, effectivePlan);
  // Admins whose device clock differs from the workspace timezone get a one-click "use my timezone" banner.
  const [canAdmin, canSources] = await Promise.all([hasPermission("settings.manage"), hasPermission("sources.manage")]);
  const allowed = [canAdmin && "settings.manage", canSources && "sources.manage"].filter((p): p is string => !!p);
  const workspaceTz = (await getOrgFormat(organizationId)).timezone;
  const [me] = await db.select({ language: users.language }).from(users).where(eq(users.id, userId)).limit(1);
  const lang = isLang(me?.language) ? me.language : "en";

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
        <Header isSuperAdmin={superAdmin} organizationId={organizationId} usageStats={usageStats} allowed={allowed} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <FloatingAssistant storageKey={userId} />
      <SignupAttribution userId={userId} />
    </div>
    </PlanProvider>
    </LanguageProvider>
  );
}
