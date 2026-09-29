import type { MetaCapiConfig, CapiEventLog } from "@/domains/platform/capiService";
// The console never receives the CAPI access token — only whether one is stored.
type PublicCapiConfig = Omit<MetaCapiConfig, "accessToken"> & { accessToken: string; hasAccessToken: boolean };
import type { CampaignAnalytics } from "@/domains/platform/attributionService";
import type {
  PlatformMetrics,
  EscalatedLeadSummary,
  FailedDeliverySummary,
  GlobalUserSummary,
  OrgSummary,
  FleetApiKeySummary,
  PlatformActivitySummary,
} from "@/domains/platform/service";
import type { BroadcastConfig } from "@/domains/platform/configService";
import type { RevOpsMetrics, TenantHealthSummary } from "@/domains/platform/revops";
import type { OpsWebhookConfig } from "@/domains/platform/opsAlertService";
import type { TenantBillingInfo } from "@/domains/billing/lifecycleService";
import type { TaxInvoice } from "@/domains/billing/invoiceService";
import type { Coupon } from "@/domains/billing/couponService";
import type { SupportTicket } from "@/domains/platform/supportService";
import type { ExecutiveDigestConfig } from "@/domains/platform/executiveDigestService";
import type { SecurityAnomaly } from "@/domains/platform/anomalyDetectionService";

export type PlatformConsoleProps = {
  initial?: OrgSummary[];
  initialUsers?: GlobalUserSummary[];
  initialBroadcast?: BroadcastConfig | null;
  metrics?: PlatformMetrics;
  escalations?: EscalatedLeadSummary[];
  dlq?: FailedDeliverySummary[];
  initialTab?: string;
  revenueSummary?: { mrr: number; paidAccounts: number };
  revops?: RevOpsMetrics;
  tenantHealth?: TenantHealthSummary[];
  initialMaintenance?: { enabled: boolean; message: string };
  initialOpsAlert?: OpsWebhookConfig;
  initialBilling?: TenantBillingInfo[];
  initialInvoices?: TaxInvoice[];
  initialCoupons?: Coupon[];
  initialTickets?: SupportTicket[];
  initialApiKeys?: FleetApiKeySummary[];
  initialDigestConfig?: ExecutiveDigestConfig;
  initialAnomalies?: SecurityAnomaly[];
  initialCapiConfig?: PublicCapiConfig;
  initialCapiLogs?: CapiEventLog[];
  initialCampaigns?: {
    campaigns: CampaignAnalytics[];
    totalSignups: number;
    attributedSignups: number;
    directSignups: number;
    attributedMrr: number;
  };
  initialActivity?: PlatformActivitySummary[];
  openTicketCount?: number;
  activeThreatCount?: number;
};
