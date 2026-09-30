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
import { TABS, tabNeeds, type Tab } from "@/components/platform/console/tabData";


// Platform operator console — every organization on the instance. Super-admin only.
// Loads only what the open tab shows (plus the header's headline numbers); switching tabs updates
// ?tab=, which re-runs this with the new tab and remounts the console with fresh data.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await isSuperAdmin())) redirect("/leads");
  const requested = (await searchParams).tab;
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "tenants";
  // What each tab loads lives in TAB_PROPS (console/tabData.ts) — add a prop there, not a tab list here.
  const needs = (prop: Parameters<typeof tabNeeds>[1]) => tabNeeds(tab, prop);
  const when = <T,>(cond: boolean, load: () => Promise<T>) => (cond ? load() : Promise.resolve(undefined));

  const [
    metrics, summary, orgs, users, escalations, dlq, broadcast, revops, tenantHealth, maintenance, opsAlert,
    fleetBilling, invoices, coupons, tickets, openTicketCount, apiKeys, digestConfig, anomalies, activeThreatCount, capiConfig, capiLogs, campaignStats, platformActivity,
  ] = await Promise.all([
    PlatformService.getPlatformMetrics(),
    RevOpsService.getSummary(),
    when(needs("initial"), () => PlatformService.listOrganizations()),
    when(needs("initialUsers"), () => PlatformService.searchUsers("", 50)),
    when(needs("escalations"), () => PlatformService.getEscalatedLeads(15)),
    when(needs("dlq"), () => PlatformService.getFailedDeliveries(15)),
    when(needs("initialBroadcast"), () => PlatformService.getBroadcast()),
    when(needs("revops"), () => RevOpsService.getMetrics()),
    when(needs("tenantHealth"), () => RevOpsService.listTenantHealth(500)),
    PlatformConfigService.get("maintenance_mode", { enabled: false, message: "" }), // tab badge
    OpsAlertService.getView(), // tab badge
    when(needs("initialBilling"), () => BillingLifecycleService.listFleetBillingStatus()),
    when(needs("initialInvoices"), () => InvoiceService.listInvoices(50)),
    when(needs("initialCoupons"), () => CouponService.list()),
    when(needs("initialTickets"), () => SupportTicketService.listTickets("all")),
    SupportTicketService.countOpen().catch(() => 0), // tab badge
    when(needs("initialApiKeys"), () => PlatformService.listFleetApiKeys(50)),
    when(needs("initialDigestConfig"), () => ExecutiveDigestService.getConfig()),
    when(needs("initialAnomalies"), () => AnomalyDetectionService.getCachedAnomalies()),
    AnomalyDetectionService.countActiveCached().catch(() => 0), // tab badge
    when(needs("initialCapiConfig"), async () => MetaCapiService.publicConfig(await MetaCapiService.getConfig())),
    when(needs("initialCapiLogs"), () => MetaCapiService.listLogs(25)),
    when(needs("initialCampaigns"), () => PlatformAttributionService.getCampaignAnalytics()),
    when(needs("initialActivity"), () => PlatformService.getPlatformActivity(50)),
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
        openTicketCount={openTicketCount}
        initialApiKeys={apiKeys}
        initialDigestConfig={digestConfig}
        initialAnomalies={anomalies}
        activeThreatCount={activeThreatCount}
        initialCapiConfig={capiConfig}
        initialCapiLogs={capiLogs}
        initialCampaigns={campaignStats}
        initialActivity={platformActivity}
      />
    </div>
  );
}
