import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/rbac";
import { PlatformService } from "@/domains/platform/service";
import { RevOpsService } from "@/domains/platform/revops";
import { PlatformConfigService } from "@/domains/platform/configService";
import { OpsAlertService } from "@/domains/platform/opsAlertService";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";
import { InvoiceService } from "@/domains/billing/invoiceService";
import { CouponService } from "@/domains/billing/couponService";
import { SupportTicketService } from "@/domains/platform/supportService";
import { ExecutiveDigestService } from "@/domains/platform/executiveDigestService";
import { AnomalyDetectionService } from "@/domains/platform/anomalyDetectionService";
import { MetaCapiService } from "@/domains/platform/capiService";
import { PlatformAttributionService } from "@/domains/platform/attributionService";
import { PlatformConsole } from "@/components/platform/PlatformConsole";

const TABS = ["tenants", "revops", "support", "announcements", "compliance", "users", "escalations", "dlq", "system"] as const;
type Tab = (typeof TABS)[number];

// Platform operator console — every organization on the instance. Super-admin only.
// Loads only what the open tab shows (plus the header's headline numbers); switching tabs updates
// ?tab=, which re-runs this with the new tab and remounts the console with fresh data.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await isSuperAdmin())) redirect("/leads");
  const requested = (await searchParams).tab;
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "tenants";
  const on = (...tabs: Tab[]) => tabs.includes(tab);
  const when = <T,>(cond: boolean, load: () => Promise<T>) => (cond ? load() : Promise.resolve(undefined));

  const [
    metrics, summary, orgs, users, escalations, dlq, broadcast, revops, tenantHealth, maintenance, opsAlert,
    fleetBilling, invoices, coupons, tickets, apiKeys, digestConfig, anomalies, capiConfig, capiLogs, campaignStats, platformActivity,
  ] = await Promise.all([
    PlatformService.getPlatformMetrics(),
    RevOpsService.getSummary(),
    // Org list also feeds pickers in RevOps (invoice dialog) and Compliance (offboarding).
    when(on("tenants", "revops", "compliance", "announcements", "system"), () => PlatformService.listOrganizations()),
    when(on("users", "compliance", "revops", "system"), () => PlatformService.searchUsers("", 50)),
    when(on("escalations"), () => PlatformService.getEscalatedLeads(15)),
    when(on("dlq"), () => PlatformService.getFailedDeliveries(15)),
    when(on("announcements"), () => PlatformService.getBroadcast()),
    when(on("revops"), () => RevOpsService.getMetrics()),
    when(on("revops"), () => RevOpsService.listTenantHealth(30)),
    PlatformConfigService.get("maintenance_mode", { enabled: false, message: "" }), // tab badge
    when(on("system"), () => OpsAlertService.getConfig()),
    when(on("revops"), () => BillingLifecycleService.listFleetBillingStatus()),
    when(on("revops", "compliance"), () => InvoiceService.listInvoices(50)),
    when(on("revops"), () => CouponService.list()),
    SupportTicketService.listTickets("all"), // open-ticket badge; one row read
    when(on("system"), () => PlatformService.listFleetApiKeys(50)),
    when(on("system"), () => ExecutiveDigestService.getConfig()),
    when(on("system"), () => AnomalyDetectionService.getCachedAnomalies()),
    when(on("revops"), async () => MetaCapiService.publicConfig(await MetaCapiService.getConfig())),
    when(on("revops"), () => MetaCapiService.listLogs(25)),
    when(on("revops"), () => PlatformAttributionService.getCampaignAnalytics()),
    when(on("system"), () => PlatformService.getPlatformActivity(50)),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Platform Operations</h2>
        <p className="text-sm text-muted-foreground">
          Every workspace on Ridhzo: accounts, billing, support, compliance and system health.
        </p>
      </div>
      <PlatformConsole
        key={tab}
        initialTab={tab}
        initial={orgs}
        initialUsers={users}
        initialBroadcast={broadcast}
        metrics={metrics}
        revenueSummary={summary}
        escalations={escalations}
        dlq={dlq}
        revops={revops}
        tenantHealth={tenantHealth}
        initialMaintenance={maintenance}
        initialOpsAlert={opsAlert}
        initialBilling={fleetBilling}
        initialInvoices={invoices}
        initialCoupons={coupons}
        initialTickets={tickets}
        initialApiKeys={apiKeys}
        initialDigestConfig={digestConfig}
        initialAnomalies={anomalies}
        initialCapiConfig={capiConfig}
        initialCapiLogs={capiLogs}
        initialCampaigns={campaignStats}
        initialActivity={platformActivity}
      />
    </div>
  );
}
