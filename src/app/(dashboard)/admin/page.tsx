import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/rbac";
import { PlatformService } from "@/domains/platform/service";
import { FeatureFlagService } from "@/domains/platform/featureFlags";
import { RevOpsService } from "@/domains/platform/revops";
import { PlatformConfigService } from "@/domains/platform/configService";
import { OpsAlertService } from "@/domains/platform/opsAlertService";
import { BillingLifecycleService } from "@/domains/billing/lifecycleService";
import { InvoiceService } from "@/domains/billing/invoiceService";
import { CouponService } from "@/domains/billing/couponService";
import { SupportTicketService } from "@/domains/platform/supportService";
import { ExecutiveDigestService } from "@/domains/platform/executiveDigestService";
import { AnomalyDetectionService } from "@/domains/platform/anomalyDetectionService";
import { CustomDomainService } from "@/domains/platform/customDomainService";
import { MetaCapiService } from "@/domains/platform/capiService";
import { PlatformAttributionService } from "@/domains/platform/attributionService";
import { PlatformConsole } from "@/components/platform/PlatformConsole";

// Platform operator console — every organization on the instance. Super-admin only.
export default async function AdminPage() {
  if (!(await isSuperAdmin())) redirect("/leads");
  const [
    orgs,
    metrics,
    escalations,
    dlq,
    users,
    broadcast,
    flags,
    revops,
    tenantHealth,
    maintenance,
    opsAlert,
    fleetBilling,
    invoices,
    coupons,
    tickets,
    apiKeys,
    digestConfig,
    anomalies,
    domains,
    capiConfig,
    capiLogs,
    campaignStats,
  ] = await Promise.all([
    PlatformService.listOrganizations(),
    PlatformService.getPlatformMetrics(),
    PlatformService.getEscalatedLeads(15),
    PlatformService.getFailedDeliveries(15),
    PlatformService.searchUsers("", 50),
    PlatformService.getBroadcast(),
    FeatureFlagService.list(),
    RevOpsService.getMetrics(),
    RevOpsService.listTenantHealth(30),
    PlatformConfigService.get("maintenance_mode", { enabled: false, message: "" }),
    OpsAlertService.getConfig(),
    BillingLifecycleService.listFleetBillingStatus(),
    InvoiceService.listInvoices(50),
    CouponService.list(),
    SupportTicketService.listTickets("all"),
    PlatformService.listFleetApiKeys(50),
    ExecutiveDigestService.getConfig(),
    AnomalyDetectionService.scanAnomalies(),
    CustomDomainService.listDomains(),
    MetaCapiService.getConfig(),
    MetaCapiService.listLogs(25),
    PlatformAttributionService.getCampaignAnalytics(),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Platform Operations Console</h2>
        <p className="text-sm text-muted-foreground">
          Cross-tenant system health, active SLA escalations, DLQ webhook failures, and organization governance.
        </p>
      </div>
      <PlatformConsole
        initial={orgs}
        initialUsers={users}
        initialBroadcast={broadcast}
        metrics={metrics}
        escalations={escalations}
        dlq={dlq}
        initialFlags={flags}
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
        initialDomains={domains}
        initialCapiConfig={capiConfig}
        initialCapiLogs={capiLogs}
        initialCampaigns={campaignStats}
      />
    </div>
  );
}


