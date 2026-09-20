import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { InstallPwaBanner } from "@/components/layout/InstallPwaBanner";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { SystemBroadcastBanner } from "@/components/platform/SystemBroadcastBanner";
import { PaymentGraceBanner } from "@/components/billing/PaymentGraceBanner";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { isSuperAdmin, requireOrg } from "@/lib/rbac";

// Every dashboard page is authed and DB-backed — render per request, never prerender at build.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const superAdmin = await isSuperAdmin();
  const { userId } = await requireOrg();
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar isSuperAdmin={superAdmin} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <SystemBroadcastBanner />
        <PaymentGraceBanner />
        <ImpersonationBanner />
        <InstallPwaBanner />
        <Header isSuperAdmin={superAdmin} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <FloatingAssistant storageKey={userId} />
    </div>
  );
}
