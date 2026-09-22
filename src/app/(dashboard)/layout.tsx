import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { InstallPwaBanner } from "@/components/layout/InstallPwaBanner";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { SystemBroadcastBanner } from "@/components/platform/SystemBroadcastBanner";
import { PaymentGraceBanner } from "@/components/billing/PaymentGraceBanner";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { isSuperAdmin, requireOrg } from "@/lib/rbac";
import { PlatformConfigService } from "@/domains/platform/configService";
import { PlanService } from "@/domains/billing/planService";
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

  const usageStats = await PlanService.getUsageStats(organizationId);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar isSuperAdmin={superAdmin} plan={usageStats?.plan} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <SystemBroadcastBanner />
        <PaymentGraceBanner />
        <ImpersonationBanner />
        <InstallPwaBanner />
        <Header isSuperAdmin={superAdmin} organizationId={organizationId} usageStats={usageStats} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <FloatingAssistant storageKey={userId} />
    </div>
  );
}
