"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  LogIn,
  Ban,
  RotateCcw,
  Building2,
  AlertTriangle,
  Radio,
  Activity,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  Megaphone,
  Database,
  Trash2,
  RefreshCw,
  TrendingUp,
  Sliders,
  Zap,
  Power,
  HeartPulse,
  CreditCard,
  Plus,
  Shield,
  Bell,
  Lock,
  Mail,
  LifeBuoy,
  Receipt,
  Percent,
  Key,
  FileSpreadsheet,
  History,
  UserX,
  ShieldAlert,
  Send,
  Inbox,
  Globe,
  UserCheck,
  Clock,
  StickyNote,
  Target,
} from "lucide-react";
import type { MetaCapiConfig, CapiEventLog } from "@/domains/platform/capiService";
import type { CampaignAnalytics } from "@/domains/platform/attributionService";
import { saveCapiConfigAction, sendTestCapiPingAction } from "@/lib/actions/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  setOrgPlanAction,
  setOrgSuspendedAction,
  impersonateOrgAction,
  searchGlobalUsersAction,
  toggleUserActiveAction,
  toggleSuperAdminAction,
  setOrgSeatOverrideAction,
  setBroadcastAction,
  retryAllFailedDeliveriesAction,
  purgeRecycleBinAction,
  toggleFeatureFlagAction,
  grantTenantCreditsAction,
  toggleMaintenanceModeAction,
  searchDsrSubjectAction,
  exportDsrDossierAction,
  executeRightToBeForgottenAction,
  exportTenantDossierAction,
  hardDeleteTenantAction,
  triggerSuspensionRetentionScanAction,
  saveOpsAlertConfigAction,
  testOpsAlertAction,
  getTenantSecurityPolicyAction,
  setTenantSecurityPolicyAction,
  listBillingLifecycleAction,
  extendGracePeriodAction,
  markTenantManuallyPaidAction,
  sendDunningNoticeAction,
  simulatePaymentFailureAction,
  generateInvoiceAction,
  voidInvoiceAction,
  issueCreditNoteAction,
  createCouponAction,
  toggleCouponAction,
  deleteCouponAction,
  replySupportTicketAction,
  updateSupportTicketStatusAction,
  revokeUserSessionsAction,
  revokeOrgSessionsAction,
  exportPlatformCsvAction,
  getTenantAuditLogsAction,
  getPlatformActivityAction,
  revokeFleetApiKeyAction,
  saveExecutiveDigestConfigAction,
  sendTestExecutiveDigestAction,
  triggerExecutiveDigestAction,
  listAnomaliesAction,
  resolveAnomalyAction,
  remediateAnomalyAction,
  setTenantFlagOverrideAction,
  assignSupportTicketAction,
  addSupportTicketNoteAction,
  registerCustomDomainAction,
  verifyCustomDomainAction,
  removeCustomDomainAction,
} from "@/lib/actions/platform";
import type {
  PlatformMetrics,
  EscalatedLeadSummary,
  FailedDeliverySummary,
  GlobalUserSummary,
  OrgSummary,
  FleetApiKeySummary,
  TenantAuditSummary,
  PlatformActivitySummary,
} from "@/domains/platform/service";
import type { BroadcastConfig } from "@/domains/platform/configService";
import type { FeatureFlag } from "@/domains/platform/featureFlags";
import type { RevOpsMetrics, TenantHealthSummary } from "@/domains/platform/revops";
import type { OpsWebhookConfig } from "@/domains/platform/opsAlertService";
import type { SubjectMatch } from "@/domains/platform/complianceService";
import type { TenantSecurityPolicy } from "@/domains/platform/securityPolicyService";
import type { TenantBillingInfo } from "@/domains/billing/lifecycleService";
import type { TaxInvoice } from "@/domains/billing/invoiceService";
import type { Coupon } from "@/domains/billing/couponService";
import type { SupportTicket } from "@/domains/platform/supportService";
import type { ExecutiveDigestConfig } from "@/domains/platform/executiveDigestService";
import type { SecurityAnomaly } from "@/domains/platform/anomalyDetectionService";
import type { CustomDomainRecord } from "@/domains/platform/customDomainService";

const PLANS = ["free", "pro", "business"];

export function PlatformConsole({
  initial = [],
  initialUsers = [],
  initialBroadcast,
  metrics,
  escalations = [],
  dlq = [],
  initialFlags = [],
  revops,
  tenantHealth = [],
  initialMaintenance = { enabled: false, message: "" },
  initialOpsAlert,
  initialBilling = [],
  initialInvoices = [],
  initialCoupons = [],
  initialTickets = [],
  initialApiKeys = [],
  initialDigestConfig,
  initialAnomalies = [],
  initialDomains = [],
  initialCapiConfig,
  initialCapiLogs = [],
  initialCampaigns,
  initialActivity = [],
}: {
  initial?: OrgSummary[];
  initialUsers?: GlobalUserSummary[];
  initialBroadcast?: BroadcastConfig | null;
  metrics?: PlatformMetrics;
  escalations?: EscalatedLeadSummary[];
  dlq?: FailedDeliverySummary[];
  initialFlags?: FeatureFlag[];
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
  initialDomains?: CustomDomainRecord[];
  initialCapiConfig?: MetaCapiConfig;
  initialCapiLogs?: CapiEventLog[];
  initialCampaigns?: {
    campaigns: CampaignAnalytics[];
    totalSignups: number;
    attributedSignups: number;
    directSignups: number;
    attributedMrr: number;
  };
  initialActivity?: PlatformActivitySummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [orgs, setOrgs] = React.useState<OrgSummary[]>(initial ?? []);
  const [users, setUsers] = React.useState<GlobalUserSummary[]>(initialUsers ?? []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = React.useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // Meta Conversions & Ad Source Tracking State
  const [capiConfig, setCapiConfig] = React.useState<MetaCapiConfig>(
    initialCapiConfig ?? { pixelId: "", accessToken: "", testEventCode: "", enabled: false }
  );
  const [capiLogs, setCapiLogs] = React.useState<CapiEventLog[]>(initialCapiLogs ?? []);
  const [campaignStats] = React.useState(initialCampaigns);
  const [savingCapi, setSavingCapi] = React.useState(false);
  const [testingCapi, setTestingCapi] = React.useState(false);

  const handleSaveCapi = async () => {
    setSavingCapi(true);
    try {
      const res = await saveCapiConfigAction(capiConfig);
      if (res.ok) {
        toast({ title: "Meta Conversions Settings Saved", description: res.data.enabled ? "Active." : "Disabled." });
        setCapiConfig(res.data);
      } else {
        toast({ title: "Save failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setSavingCapi(false);
    }
  };

  const handleTestCapiPing = async () => {
    setTestingCapi(true);
    try {
      const res = await sendTestCapiPingAction();
      if (res.ok) {
        toast({ title: "Test Event Sent", description: "Dispatched CompleteRegistration to Meta Conversions." });
        const { listCapiLogsAction } = await import("@/lib/actions/platform");
        const fresh = await listCapiLogsAction(25);
        if (fresh.ok) setCapiLogs(fresh.data);
      } else {
        toast({ title: "Conversions Test Failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setTestingCapi(false);
    }
  };

  const urlTab = searchParams.get("tab");
  const validTabs = React.useMemo(
    () => ["tenants", "revops", "support", "flags", "compliance", "users", "escalations", "dlq", "system"] as const,
    []
  );
  type TabKey = typeof validTabs[number];

  const [tab, setTabState] = React.useState<TabKey>(
    urlTab && (validTabs as readonly string[]).includes(urlTab) ? (urlTab as TabKey) : "tenants"
  );

  React.useEffect(() => {
    if (urlTab && (validTabs as readonly string[]).includes(urlTab) && urlTab !== tab) {
      setTabState(urlTab as TabKey);
    }
  }, [urlTab, validTabs, tab]);

  const setTab = React.useCallback(
    (nextTab: TabKey) => {
      setTabState(nextTab);
      router.replace(`/admin?tab=${nextTab}`, { scroll: false });
    },
    [router]
  );
  const [flags, setFlags] = React.useState<FeatureFlag[]>(initialFlags ?? []);
  const [maintenance, setMaintenance] = React.useState<{ enabled: boolean; message: string }>(
    initialMaintenance ?? { enabled: false, message: "" }
  );
  const [maintenanceSaving, setMaintenanceSaving] = React.useState(false);
  const [healthList, setHealthList] = React.useState<TenantHealthSummary[]>(tenantHealth ?? []);
  const [healthFilter, setHealthFilter] = React.useState<string>("all");
  const [healthSearch, setHealthSearch] = React.useState("");

  // Billing Lifecycle & Dunning Fleet state
  const [billingList, setBillingList] = React.useState<TenantBillingInfo[]>(initialBilling ?? []);
  const [billingFilter, setBillingFilter] = React.useState<string>("all");
  const [billingSearch, setBillingSearch] = React.useState("");
  const [billingBusyId, setBillingBusyId] = React.useState<string | null>(null);

  const filteredBilling = React.useMemo(() => {
    return billingList.filter((item) => {
      if (billingFilter !== "all" && item.status !== billingFilter) return false;
      if (!billingSearch.trim()) return true;
      const q = billingSearch.toLowerCase();
      return (
        item.orgName.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.plan.toLowerCase().includes(q) ||
        (item.failureReason && item.failureReason.toLowerCase().includes(q))
      );
    });
  }, [billingList, billingFilter, billingSearch]);

  const refreshBillingFleet = React.useCallback(async () => {
    const res = await listBillingLifecycleAction();
    if (res.ok && res.data) {
      setBillingList(res.data);
    }
  }, []);

  const handleExtendGrace = async (orgId: string) => {
    setBillingBusyId(`extend-${orgId}`);
    try {
      const res = await extendGracePeriodAction(orgId, 7);
      if (res.ok) {
        toast({ title: "Grace Period Extended", description: "+7 days added to tenant grace period." });
        await refreshBillingFleet();
      } else {
        toast({ title: "Failed to extend grace", description: res.message, variant: "destructive" });
      }
    } finally {
      setBillingBusyId(null);
    }
  };

  const handleMarkPaid = async (orgId: string) => {
    setBillingBusyId(`paid-${orgId}`);
    try {
      const res = await markTenantManuallyPaidAction(orgId, 30);
      if (res.ok) {
        toast({ title: "Marked Paid Offline", description: "Paid offline access granted for 30 days." });
        await refreshBillingFleet();
      } else {
        toast({ title: "Failed to update payment", description: res.message, variant: "destructive" });
      }
    } finally {
      setBillingBusyId(null);
    }
  };

  const handleSendDunning = async (orgId: string) => {
    setBillingBusyId(`dunning-${orgId}`);
    try {
      const res = await sendDunningNoticeAction(orgId);
      if (res.ok) {
        toast({ title: "Payment Reminder Sent", description: "Email & in-app warning sent to tenant admins." });
        await refreshBillingFleet();
      } else {
        toast({ title: "Failed to send dunning", description: res.message, variant: "destructive" });
      }
    } finally {
      setBillingBusyId(null);
    }
  };

  const handleSimulateFailure = async (orgId: string) => {
    setBillingBusyId(`sim-${orgId}`);
    try {
      const res = await simulatePaymentFailureAction(orgId, "Card declined: insufficient funds (Simulated)");
      if (res.ok) {
        toast({
          title: "Payment Failure Simulated",
          description: "7-day grace period started; dunning email & in-app alert dispatched.",
        });
        await refreshBillingFleet();
      } else {
        toast({ title: "Simulation failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setBillingBusyId(null);
    }
  };

  // --- Invoices State ---
  const [invoices, setInvoices] = React.useState<TaxInvoice[]>(initialInvoices ?? []);
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [invoiceOrgId, setInvoiceOrgId] = React.useState("");
  const [invoicePlan, setInvoicePlan] = React.useState("pro");
  const [invoiceAmount, setInvoiceAmount] = React.useState("249");
  const [invoiceGstin, setInvoiceGstin] = React.useState("");
  const [invoiceGenerating, setInvoiceGenerating] = React.useState(false);

  const handleGenerateInvoice = async () => {
    if (!invoiceOrgId) return;
    setInvoiceGenerating(true);
    try {
      const res = await generateInvoiceAction({
        orgId: invoiceOrgId,
        plan: invoicePlan,
        amount: Number(invoiceAmount) || 0,
        gstin: invoiceGstin || null,
        status: "paid",
      });
      if (res.ok) {
        toast({ title: "Tax Invoice Issued", description: `Generated ${res.data.invoiceNumber}` });
        setInvoices((prev) => [res.data, ...prev]);
        setInvoiceModalOpen(false);
      } else {
        toast({ title: "Failed to generate invoice", description: res.message, variant: "destructive" });
      }
    } finally {
      setInvoiceGenerating(false);
    }
  };

  const handleVoidInvoice = async (id: string) => {
    const res = await voidInvoiceAction(id);
    if (res.ok) {
      toast({ title: "Invoice Voided", description: `Marked invoice as void.` });
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status: "void" } : inv)));
    } else {
      toast({ title: "Failed to void invoice", description: res.message, variant: "destructive" });
    }
  };

  const handleIssueCreditNote = async (inv: TaxInvoice) => {
    const reason = prompt(
      `Issue GST Credit Note for ${inv.invoiceNumber} (₹${inv.totalAmount})?\nEnter reason:`,
      "Double charge refund"
    );
    if (reason === null) return;
    const res = await issueCreditNoteAction(inv.id, reason);
    if (res.ok) {
      toast({
        title: "Credit Note Issued",
        description: `${res.data.invoiceNumber} issued for ₹${Math.abs(res.data.totalAmount)}.`,
      });
      setInvoices((prev) => [
        res.data,
        ...prev.map((i) => (i.id === inv.id ? { ...i, status: "refunded" as const } : i)),
      ]);
    } else {
      toast({ title: "Failed to issue credit note", description: res.message, variant: "destructive" });
    }
  };

  // --- Coupons State ---
  const [coupons, setCoupons] = React.useState<Coupon[]>(initialCoupons ?? []);
  const [couponModalOpen, setCouponModalOpen] = React.useState(false);
  const [couponCode, setCouponCode] = React.useState("");
  const [couponType, setCouponType] = React.useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = React.useState("25");
  const [couponMax, setCouponMax] = React.useState("100");
  const [couponSaving, setCouponSaving] = React.useState(false);

  const handleCreateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponSaving(true);
    try {
      const res = await createCouponAction({
        code: couponCode,
        discountType: couponType,
        discountValue: Number(couponValue) || 0,
        maxRedemptions: Number(couponMax) || 0,
      });
      if (res.ok) {
        toast({ title: "Coupon Created", description: `Code ${res.data.code} is now live.` });
        setCoupons((prev) => [res.data, ...prev]);
        setCouponModalOpen(false);
        setCouponCode("");
      } else {
        toast({ title: "Failed to create coupon", description: res.message, variant: "destructive" });
      }
    } finally {
      setCouponSaving(false);
    }
  };

  const handleToggleCoupon = async (id: string, active: boolean) => {
    const res = await toggleCouponAction(id, active);
    if (res.ok) {
      setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, active } : c)));
      toast({ title: active ? "Coupon Activated" : "Coupon Deactivated" });
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    const res = await deleteCouponAction(id);
    if (res.ok) {
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Coupon Deleted" });
    }
  };

  // --- Support Tickets State ---
  const [tickets, setTickets] = React.useState<SupportTicket[]>(initialTickets ?? []);
  const [ticketFilter, setTicketFilter] = React.useState("all");
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null);
  const [ticketReplyText, setTicketReplyText] = React.useState("");
  const [replySending, setReplySending] = React.useState(false);

  const filteredTickets = React.useMemo(() => {
    if (ticketFilter === "all") return tickets;
    return tickets.filter((t) => t.status === ticketFilter);
  }, [tickets, ticketFilter]);

  const handleSendTicketReply = async () => {
    if (!selectedTicket || !ticketReplyText.trim()) return;
    setReplySending(true);
    try {
      const res = await replySupportTicketAction(selectedTicket.id, ticketReplyText.trim());
      if (res.ok) {
        toast({ title: "Reply Sent", description: "In-app alert dispatched to tenant." });
        setSelectedTicket(res.data);
        setTickets((prev) => prev.map((t) => (t.id === res.data.id ? res.data : t)));
        setTicketReplyText("");
      } else {
        toast({ title: "Failed to send reply", description: res.message, variant: "destructive" });
      }
    } finally {
      setReplySending(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: "open" | "in_progress" | "resolved") => {
    const res = await updateSupportTicketStatusAction(ticketId, status);
    if (res.ok) {
      toast({ title: "Ticket Updated", description: `Status changed to ${status}` });
      if (selectedTicket?.id === ticketId) setSelectedTicket(res.data);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data : t)));
    }
  };

  // --- API Keys & Audit Trail State ---
  const [apiKeys, setApiKeys] = React.useState<FleetApiKeySummary[]>(initialApiKeys ?? []);
  const [auditModalOrg, setAuditModalOrg] = React.useState<OrgSummary | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<TenantAuditSummary[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);

  const [activity, setActivity] = React.useState<PlatformActivitySummary[]>(initialActivity ?? []);
  const [activityLoading, setActivityLoading] = React.useState(false);

  const handleRefreshActivity = async () => {
    setActivityLoading(true);
    try {
      const res = await getPlatformActivityAction();
      if (res.ok) setActivity(res.data);
    } finally {
      setActivityLoading(false);
    }
  };

  const handleOpenAuditModal = async (org: OrgSummary) => {
    setAuditModalOrg(org);
    setAuditLoading(true);
    try {
      const res = await getTenantAuditLogsAction(org.id);
      if (res.ok) setAuditLogs(res.data);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleRevokeFleetKey = async (id: string) => {
    const res = await revokeFleetApiKeyAction(id);
    if (res.ok) {
      toast({ title: "API Key Revoked" });
      setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
    }
  };

  // --- Session Killswitch & CSV Exporters ---
  const handleRevokeUserSession = async (userId: string) => {
    const res = await revokeUserSessionsAction(userId);
    if (res.ok) {
      toast({ title: "User Sessions Terminated", description: "Target user forced to re-login." });
    }
  };

  const handleRevokeOrgSession = async (orgId: string) => {
    if (!confirm("Force ALL members of this org to re-login now?")) return;
    const res = await revokeOrgSessionsAction(orgId);
    if (res.ok) {
      toast({ title: "Tenant Sessions Terminated", description: "All members of organization forced to re-login." });
    }
  };

  const handleExportCsv = async (type: "tenants" | "financial" | "churn") => {
    try {
      const res = await exportPlatformCsvAction(type);
      if (res.ok) {
        const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", res.data.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Export Downloaded", description: res.data.filename });
      }
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  // --- Executive Digest State ---
  const [digestConfig, setDigestConfig] = React.useState<ExecutiveDigestConfig>(
    initialDigestConfig ?? { enabled: false, frequency: "weekly", recipients: [], lastSentAt: null }
  );
  const [digestRecipientsInput, setDigestRecipientsInput] = React.useState(
    (initialDigestConfig?.recipients ?? []).join(", ")
  );
  const [testDigestEmail, setTestDigestEmail] = React.useState("");
  const [digestBusy, setDigestBusy] = React.useState(false);

  const handleSaveDigest = async () => {
    setDigestBusy(true);
    try {
      const recipients = digestRecipientsInput
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      const res = await saveExecutiveDigestConfigAction({
        enabled: digestConfig.enabled,
        frequency: digestConfig.frequency,
        recipients,
      });
      if (res.ok) {
        setDigestConfig(res.data);
        toast({ title: "Digest Config Saved", description: "Automated executive reporting schedule updated." });
      } else {
        toast({ title: "Failed to save digest", description: res.message, variant: "destructive" });
      }
    } finally {
      setDigestBusy(false);
    }
  };

  const handleSendTestDigest = async () => {
    if (!testDigestEmail.trim()) return;
    setDigestBusy(true);
    try {
      const res = await sendTestExecutiveDigestAction(testDigestEmail.trim());
      if (res.ok) {
        toast({ title: "Test Digest Sent", description: `Dispatched preview briefing to ${testDigestEmail}` });
        setTestDigestEmail("");
      } else {
        toast({ title: "Failed to send test digest", description: res.message, variant: "destructive" });
      }
    } finally {
      setDigestBusy(false);
    }
  };

  const handleTriggerLiveDigest = async () => {
    setDigestBusy(true);
    try {
      const res = await triggerExecutiveDigestAction();
      if (res.ok) {
        toast({
          title: "Executive Digest Dispatched",
          description: `Delivered to ${res.data.count} leadership recipient(s).`,
        });
        setDigestConfig((prev) => ({ ...prev, lastSentAt: new Date().toISOString() }));
      } else {
        toast({ title: "Dispatch failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setDigestBusy(false);
    }
  };

  // --- Anomaly & Abuse Detection State ---
  const [anomalies, setAnomalies] = React.useState<SecurityAnomaly[]>(initialAnomalies ?? []);
  const [anomalyBusyId, setAnomalyBusyId] = React.useState<string | null>(null);
  const [anomalyFilter, setAnomalyFilter] = React.useState<"all" | "active" | "resolved">("active");

  const filteredAnomalies = React.useMemo(() => {
    if (anomalyFilter === "all") return anomalies;
    return anomalies.filter((a) => a.status === anomalyFilter);
  }, [anomalies, anomalyFilter]);

  const handleScanAnomalies = async () => {
    setAnomalyBusyId("scan");
    try {
      const res = await listAnomaliesAction();
      if (res.ok) {
        setAnomalies(res.data);
        toast({
          title: "Threat Scan Completed",
          description: `Scanned fleet; ${res.data.filter((a) => a.status === "active").length} active threats found.`,
        });
      }
    } finally {
      setAnomalyBusyId(null);
    }
  };

  const handleRemediateAnomaly = async (id: string) => {
    setAnomalyBusyId(`rem-${id}`);
    try {
      const res = await remediateAnomalyAction(id);
      if (res.ok) {
        toast({ title: "Remediation Executed", description: res.data.message });
        setAnomalies((prev) => prev.map((a) => (a.id === id ? { ...a, status: "resolved" } : a)));
      } else {
        toast({ title: "Remediation failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setAnomalyBusyId(null);
    }
  };

  const handleResolveAnomaly = async (id: string, action: "resolve" | "dismiss") => {
    setAnomalyBusyId(`res-${id}`);
    try {
      const res = await resolveAnomalyAction(id, action);
      if (res.ok) {
        toast({ title: action === "resolve" ? "Threat Marked Resolved" : "Threat Dismissed" });
        setAnomalies((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: action === "resolve" ? "resolved" : "dismissed" } : a))
        );
      }
    } finally {
      setAnomalyBusyId(null);
    }
  };

  // --- Custom Domains State ---
  const [domains, setDomains] = React.useState<CustomDomainRecord[]>(initialDomains ?? []);
  const [domainModalOpen, setDomainModalOpen] = React.useState(false);
  const [domainOrgId, setDomainOrgId] = React.useState("");
  const [domainNameInput, setDomainNameInput] = React.useState("");
  const [domainBusy, setDomainBusy] = React.useState(false);

  const handleRegisterDomain = async () => {
    if (!domainOrgId || !domainNameInput.trim()) return;
    setDomainBusy(true);
    try {
      const res = await registerCustomDomainAction(domainOrgId, domainNameInput.trim());
      if (res.ok) {
        toast({ title: "Custom Domain Registered", description: `${res.data.domain} mapped.` });
        setDomains((prev) => [res.data, ...prev.filter((d) => d.id !== res.data.id)]);
        setDomainModalOpen(false);
        setDomainNameInput("");
      } else {
        toast({ title: "Registration failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setDomainBusy(false);
    }
  };

  const handleVerifyDomain = async (id: string) => {
    const res = await verifyCustomDomainAction(id);
    if (res.ok && res.data) {
      toast({ title: "Domain Verified & SSL Active", description: `${res.data.domain} is verified.` });
      setDomains((prev) => prev.map((d) => (d.id === id ? res.data! : d)));
    }
  };

  const handleRemoveDomain = async (id: string) => {
    const res = await removeCustomDomainAction(id);
    if (res.ok) {
      toast({ title: "Custom Domain Removed" });
      setDomains((prev) => prev.filter((d) => d.id !== id));
    }
  };

  // --- Support Triage & Internal Notes State ---
  const [ticketNoteText, setTicketNoteText] = React.useState("");
  const [ticketActiveTab, setTicketActiveTab] = React.useState<"messages" | "notes">("messages");

  const handleAssignTicket = async (ticketId: string, assignee: string | null) => {
    const res = await assignSupportTicketAction(ticketId, assignee);
    if (res.ok && res.data) {
      toast({ title: "Ticket Assigned", description: assignee ? `Assigned to ${assignee}` : "Unassigned" });
      if (selectedTicket?.id === ticketId) setSelectedTicket(res.data);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? res.data! : t)));
    }
  };

  const handleAddTicketNote = async () => {
    if (!selectedTicket || !ticketNoteText.trim()) return;
    const res = await addSupportTicketNoteAction(selectedTicket.id, ticketNoteText.trim());
    if (res.ok && res.data) {
      toast({ title: "Internal Note Added", description: "Saved private triage note." });
      setSelectedTicket(res.data);
      setTickets((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
      setTicketNoteText("");
    }
  };

  // --- Tenant Feature Overrides ---
  const handleToggleTenantFlag = async (flagKey: string, orgId: string, enabled: boolean) => {
    const res = await setTenantFlagOverrideAction(flagKey, orgId, enabled);
    if (res.ok && res.data) {
      toast({
        title: enabled ? "Tenant Override Granted" : "Tenant Override Revoked",
        description: `Updated access for flag ${flagKey}.`,
      });
      setFlags((prev) => prev.map((f) => (f.key === flagKey ? res.data! : f)));
    }
  };

  // Credits Grant Modal state
  const [creditModalOrg, setCreditModalOrg] = React.useState<TenantHealthSummary | null>(null);
  const [aiGrantAmount, setAiGrantAmount] = React.useState("500");
  const [whatsappGrantAmount, setWhatsappGrantAmount] = React.useState("250");
  const [grantingCredits, setGrantingCredits] = React.useState(false);

  // Compliance & GDPR Data Request state
  const [dsrQuery, setDsrQuery] = React.useState("");
  const [dsrResults, setDsrResults] = React.useState<SubjectMatch[]>([]);
  const [dsrSearching, setDsrSearching] = React.useState(false);
  const [dsrBusyId, setDsrBusyId] = React.useState<string | null>(null);

  // Tenant Offboarding & Erasure state
  const [offboardOrgId, setOffboardOrgId] = React.useState<string>(initial[0]?.id ?? "");
  const [exportingTenantDossier, setExportingTenantDossier] = React.useState(false);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = React.useState(false);
  const [hardDeleteConfirmInput, setHardDeleteConfirmInput] = React.useState("");
  const [hardDeletingTenant, setHardDeletingTenant] = React.useState(false);
  const [runningRetentionScan, setRunningRetentionScan] = React.useState(false);

  // Ops Webhook state
  const [opsAlert, setOpsAlert] = React.useState<OpsWebhookConfig>(
    initialOpsAlert ?? {
      url: "",
      enabled: false,
      notifyOnSladeadline: true,
      notifyOnDlq: true,
      notifyOnPlanChange: true,
      notifyOnGdpr: true,
    }
  );
  const [opsAlertSaving, setOpsAlertSaving] = React.useState(false);
  const [testingOpsAlert, setTestingOpsAlert] = React.useState(false);

  // Tenant Security Policy state
  const [secPolicyOrgId, setSecPolicyOrgId] = React.useState<string>(initial[0]?.id ?? "");
  const [secPolicy, setSecPolicy] = React.useState<TenantSecurityPolicy | null>(null);
  const [secPolicyLoading, setSecPolicyLoading] = React.useState(false);
  const [secPolicySaving, setSecPolicySaving] = React.useState(false);
  const [allowedCidrsInput, setAllowedCidrsInput] = React.useState("");

  // Org search & filtering
  const urlOrgSearch = searchParams.get("q") || searchParams.get("search") || "";
  const [orgSearch, setOrgSearch] = React.useState(urlOrgSearch);

  React.useEffect(() => {
    if (urlOrgSearch && urlOrgSearch !== orgSearch) {
      setOrgSearch(urlOrgSearch);
    }
    // Intentionally only depends on urlOrgSearch: this syncs local state FROM the URL param.
    // Adding orgSearch would re-run on every keystroke and fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOrgSearch]);
  const [planFilter, setPlanFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // User search
  const [userSearch, setUserSearch] = React.useState("");
  const [searchingUsers, setSearchingUsers] = React.useState(false);

  // Broadcast state
  const [broadcastMessage, setBroadcastMessage] = React.useState(initialBroadcast?.message ?? "");
  const [broadcastActive, setBroadcastActive] = React.useState(initialBroadcast?.active ?? false);
  const [broadcastLevel, setBroadcastLevel] = React.useState<"info" | "warning" | "destructive">(
    initialBroadcast?.level ?? "info"
  );
  const [broadcastTargetPlan, setBroadcastTargetPlan] = React.useState<"all" | "free" | "pro" | "business">(
    (initialBroadcast?.targetPlan as any) ?? "all"
  );
  const [broadcastTargetOrgId, setBroadcastTargetOrgId] = React.useState<string>(
    initialBroadcast?.targetOrgId ?? "all"
  );
  const [savingBroadcast, setSavingBroadcast] = React.useState(false);

  // Debounced user search
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await searchGlobalUsersAction(userSearch);
        setUsers(res);
      } catch {
        // quiet error
      } finally {
        setSearchingUsers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const filteredOrgs = React.useMemo(() => {
    return orgs.filter((o) => {
      if (orgSearch.trim()) {
        const q = orgSearch.trim().toLowerCase();
        const matches = o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (planFilter !== "all" && o.plan !== planFilter) return false;
      if (statusFilter === "active" && o.suspended) return false;
      if (statusFilter === "suspended" && !o.suspended) return false;
      return true;
    });
  }, [orgs, orgSearch, planFilter, statusFilter]);

  async function changePlan(org: OrgSummary, planValue: string) {
    const isTrial = planValue.endsWith("_trial");
    const cleanPlan = isTrial ? planValue.replace("_trial", "") : planValue;
    const trialDays = isTrial ? 14 : null;

    setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, plan: cleanPlan } : o)));
    const res = await setOrgPlanAction({ organizationId: org.id, plan: cleanPlan as any, trialDays });
    if (!res.ok) {
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, plan: org.plan } : o)));
      toast({ variant: "destructive", title: "Couldn't change plan", description: res.message });
    } else {
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, plan: cleanPlan, trialEndsAt: res.data.trialEndsAt } : o)));
      toast({ title: isTrial ? `14-Day ${cleanPlan} trial activated` : `Plan set to ${cleanPlan}` });
    }
  }

  async function toggleSuspend(org: OrgSummary) {
    const next = !org.suspended;
    if (next && !confirm(`Suspend ${org.name}? Its users won't be able to sign in.`)) return;
    setBusy(org.id);
    setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, suspended: next } : o)));
    const res = await setOrgSuspendedAction(org.id, next);
    if (!res.ok) {
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, suspended: org.suspended } : o)));
      toast({ variant: "destructive", title: "Couldn't update", description: res.message });
    } else {
      toast({ title: next ? "Organization suspended" : "Organization reactivated" });
    }
    setBusy(null);
  }

  const toggleSelectOrg = (id: string) => {
    setSelectedOrgIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllOrgs = () => {
    const allSelected = filteredOrgs.length > 0 && filteredOrgs.every((o) => selectedOrgIds.includes(o.id));
    setSelectedOrgIds(allSelected ? [] : filteredOrgs.map((o) => o.id));
  };

  async function handleBulkSuspend(suspend: boolean) {
    const count = selectedOrgIds.length;
    if (!count) return;
    if (!confirm(`${suspend ? "Suspend" : "Reactivate"} ${count} selected organization${count > 1 ? "s" : ""}?`)) return;

    setBulkBusy(true);
    // ponytail: sequential loop over setOrgSuspendedAction; batch endpoint when fleet > 100 orgs
    let failed = 0;
    for (const id of selectedOrgIds) {
      const res = await setOrgSuspendedAction(id, suspend);
      if (!res.ok) failed++;
    }
    setOrgs((s) => s.map((o) => (selectedOrgIds.includes(o.id) ? { ...o, suspended: suspend } : o)));
    setBulkBusy(false);
    setSelectedOrgIds([]);
    if (failed > 0) {
      toast({ variant: "destructive", title: `Completed with ${failed} failure(s)` });
    } else {
      toast({ title: `${count} organization${count > 1 ? "s" : ""} ${suspend ? "suspended" : "reactivated"}` });
    }
  }

  async function handleSetSeatOverride(org: OrgSummary) {
    const current = org.customSeats ? String(org.customSeats) : "";
    const input = prompt(`Custom seat override for ${org.name} (leave empty to reset to plan default):`, current);
    if (input === null) return;
    const seats = input.trim() ? parseInt(input.trim(), 10) : null;
    if (input.trim() && isNaN(seats as number)) {
      toast({ variant: "destructive", title: "Invalid number of seats" });
      return;
    }

    setBusy(org.id);
    const res = await setOrgSeatOverrideAction(org.id, seats);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to set seat override", description: res.message });
    } else {
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, customSeats: seats } : o)));
      toast({ title: seats ? `Seat override set to ${seats} seats` : "Seat override reset to plan default" });
    }
  }

  async function impersonate(orgId: string, redirectPath = "/leads", readOnly = false) {
    setBusy(orgId);
    const res = await impersonateOrgAction(orgId, readOnly);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Couldn't open tenant", description: res.message });
      return;
    }
    router.push(redirectPath);
  }

  async function handleToggleUserActive(user: GlobalUserSummary) {
    const next = !user.isActive;
    setBusy(user.id);
    const res = await toggleUserActiveAction(user.id, next);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Couldn't update user", description: res.message });
    } else {
      setUsers((s) => s.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
      toast({ title: next ? "User activated" : "User deactivated" });
    }
  }

  async function handleToggleSuperAdmin(user: GlobalUserSummary) {
    const next = !user.isSuperAdmin;
    if (next && !confirm(`Grant platform SuperAdmin rights to ${user.email}? They will have cross-tenant access.`)) return;
    if (!next && !confirm(`Revoke platform SuperAdmin rights from ${user.email}?`)) return;

    setBusy(user.id);
    const res = await toggleSuperAdminAction(user.id, next);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Action failed", description: res.message });
    } else {
      setUsers((s) => s.map((u) => (u.id === user.id ? { ...u, isSuperAdmin: next } : u)));
      toast({ title: next ? "SuperAdmin rights granted" : "SuperAdmin rights revoked" });
    }
  }

  async function handleSaveBroadcast() {
    setSavingBroadcast(true);
    const res = await setBroadcastAction({
      message: broadcastMessage,
      active: broadcastActive,
      level: broadcastLevel,
      targetPlan: broadcastTargetPlan === "all" ? null : broadcastTargetPlan,
      targetOrgId: broadcastTargetOrgId === "all" ? null : broadcastTargetOrgId,
    });
    setSavingBroadcast(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to update broadcast", description: res.message });
    } else {
      toast({ title: broadcastActive ? "Broadcast banner published" : "Broadcast banner deactivated" });
    }
  }

  async function handleRetryAllDlq() {
    if (!confirm("Retry all failed webhook deliveries across all tenants?")) return;
    setBusy("dlq_retry");
    const res = await retryAllFailedDeliveriesAction();
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to retry deliveries", description: res.message });
    } else {
      toast({ title: `Enqueued ${res.data.retried} failed webhook deliveries for retry` });
      router.refresh();
    }
  }

  async function handlePurgeRecycleBin() {
    if (!confirm("Permanently delete all soft-deleted items across all tenants? This cannot be undone.")) return;
    setBusy("purge_trash");
    const res = await purgeRecycleBinAction();
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to purge recycle bin", description: res.message });
    } else {
      toast({ title: `Permanently purged ${res.data.purgedCount} soft-deleted items` });
      router.refresh();
    }
  }

  function exportOrganizationsCsv() {
    const headers = ["Organization,Slug,Plan,Seats,Status,Users,Leads,Created At"];
    const rows = filteredOrgs.map((o) =>
      [
        `"${o.name.replace(/"/g, '""')}"`,
        `"${o.slug}"`,
        o.plan,
        o.customSeats ? `${o.customSeats} (custom)` : "plan default",
        o.suspended ? "Suspended" : "Active",
        o.userCount,
        o.leadCount,
        new Date(o.createdAt).toISOString(),
      ].join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ridhzo_organizations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleToggleFlag(key: string, currentEnabled: boolean) {
    const next = !currentEnabled;
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: next } : f)));
    const res = await toggleFeatureFlagAction(key, next);
    if (!res.ok) {
      setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: currentEnabled } : f)));
      toast({ variant: "destructive", title: "Failed to update feature flag", description: res.message });
    } else {
      toast({ title: `${key} ${next ? "enabled" : "disabled"}` });
    }
  }

  async function handleSaveMaintenance() {
    setMaintenanceSaving(true);
    const res = await toggleMaintenanceModeAction(maintenance.enabled, maintenance.message);
    setMaintenanceSaving(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to update maintenance mode", description: res.message });
    } else {
      toast({
        title: maintenance.enabled ? "Maintenance Mode Activated" : "Maintenance Mode Deactivated",
        description: maintenance.enabled
          ? "Platform is in restricted maintenance state."
          : "Normal platform traffic restored.",
      });
    }
  }

  async function handleGrantCredits() {
    if (!creditModalOrg) return;
    const ai = parseInt(aiGrantAmount, 10);
    const wa = parseInt(whatsappGrantAmount, 10);
    if (isNaN(ai) || isNaN(wa) || (ai <= 0 && wa <= 0)) {
      toast({ variant: "destructive", title: "Enter a positive number of credits." });
      return;
    }
    setGrantingCredits(true);
    const res = await grantTenantCreditsAction(creditModalOrg.id, ai || 0, wa || 0);
    setGrantingCredits(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to grant credits", description: res.message });
    } else {
      toast({
        title: "Credits successfully granted",
        description: `New balance: ${res.data.aiCredits} AI credits, ${res.data.whatsappCredits} WhatsApp credits.`,
      });
      setHealthList((prev) =>
        prev.map((t) =>
          t.id === creditModalOrg.id
            ? { ...t, aiCredits: res.data.aiCredits, whatsappCredits: res.data.whatsappCredits }
            : t
        )
      );
      setCreditModalOrg(null);
    }
  }

  async function handleSearchDsr() {
    if (!dsrQuery.trim() || dsrQuery.trim().length < 3) {
      toast({ variant: "destructive", title: "Enter at least 3 characters to search." });
      return;
    }
    setDsrSearching(true);
    const res = await searchDsrSubjectAction(dsrQuery.trim());
    setDsrSearching(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Search failed", description: res.message });
    } else {
      setDsrResults(res.data);
      if (res.data.length === 0) {
        toast({ title: "No subjects found matching query." });
      }
    }
  }

  async function handleExportDsr(leadId: string, name: string) {
    setDsrBusyId(leadId);
    const res = await exportDsrDossierAction(leadId);
    setDsrBusyId(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Export failed", description: res.message });
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `dsr_dossier_${name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast({ title: "Data request report downloaded" });
  }

  async function handleExecuteRightToBeForgotten(leadId: string, name: string) {
    if (
      !confirm(
        `PERMANENT ACTION:\nAre you sure you want to permanently delete all personal data for "${name}"?\n\nThis will permanently erase their phone, email, notes, and activity history, while keeping overall pipeline totals for reporting. This cannot be undone.`
      )
    ) {
      return;
    }
    setDsrBusyId(leadId);
    const res = await executeRightToBeForgottenAction(leadId);
    setDsrBusyId(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Action failed", description: res.message });
    } else {
      toast({ title: "Personal data deleted", description: `Subject ${name} anonymized.` });
      setDsrResults((prev) =>
        prev.map((r) =>
          r.id === leadId
            ? { ...r, name: "[REDACTED_GDPR]", phone: null, email: null, company: null }
            : r
        )
      );
    }
  }

  async function handleExportTenantDossier(orgId: string) {
    const targetOrg = initial.find((o) => o.id === orgId);
    setExportingTenantDossier(true);
    try {
      const res = await exportTenantDossierAction(orgId);
      if (!res.ok) {
        toast({ title: "Export Failed", description: res.message, variant: "destructive" });
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute(
        "download",
        `tenant_dossier_${targetOrg?.slug ?? orgId}_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast({ title: "Report exported", description: `Full tenant data exported for ${targetOrg?.name ?? orgId}.` });
    } catch {
      toast({ title: "Export Failed", description: "Could not export tenant dossier.", variant: "destructive" });
    } finally {
      setExportingTenantDossier(false);
    }
  }

  async function handleHardDeleteTenant() {
    const targetOrg = initial.find((o) => o.id === offboardOrgId);
    if (!targetOrg) return;
    const conf = hardDeleteConfirmInput.trim().toLowerCase();
    if (conf !== targetOrg.slug.toLowerCase() && conf !== targetOrg.name.toLowerCase()) {
      toast({ title: "Confirmation Mismatch", description: `Please type "${targetOrg.slug}" to confirm.`, variant: "destructive" });
      return;
    }
    setHardDeletingTenant(true);
    try {
      const res = await hardDeleteTenantAction(offboardOrgId, hardDeleteConfirmInput.trim());
      if (!res.ok) {
        toast({ title: "Deletion Failed", description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tenant Erased", description: `Permanently removed ${targetOrg.name} and all data.` });
      setHardDeleteModalOpen(false);
      setHardDeleteConfirmInput("");
      router.refresh();
    } catch {
      toast({ title: "Deletion Failed", description: "Failed to erase tenant.", variant: "destructive" });
    } finally {
      setHardDeletingTenant(false);
    }
  }

  async function handleRunRetentionScan() {
    setRunningRetentionScan(true);
    try {
      const res = await triggerSuspensionRetentionScanAction();
      if (!res.ok) {
        toast({ title: "Retention Scan Failed", description: res.message, variant: "destructive" });
      } else {
        toast({
          title: "Retention Scan Complete",
          description: `Scanned ${res.data.scannedCount} suspended workspaces (warned: ${res.data.warnedCount}, anonymized: ${res.data.anonymizedCount}).`,
        });
      }
    } finally {
      setRunningRetentionScan(false);
    }
  }

  async function handleSaveOpsAlert() {
    setOpsAlertSaving(true);
    const res = await saveOpsAlertConfigAction(opsAlert);
    setOpsAlertSaving(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to save ops webhook", description: res.message });
    } else {
      toast({ title: "Ops webhook configuration saved" });
    }
  }

  async function handleTestOpsAlert() {
    setTestingOpsAlert(true);
    const res = await testOpsAlertAction();
    setTestingOpsAlert(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Webhook test failed", description: res.message });
    } else {
      toast({ title: "Ping delivered successfully!", description: res.data.message });
    }
  }

  async function handleLoadSecPolicy(orgId: string) {
    setSecPolicyOrgId(orgId);
    setSecPolicyLoading(true);
    const res = await getTenantSecurityPolicyAction(orgId);
    setSecPolicyLoading(false);
    if (res.ok) {
      setSecPolicy(res.data);
      setAllowedCidrsInput(res.data.allowedCidrs.join(", "));
    }
  }

  async function handleSaveSecPolicy() {
    if (!secPolicyOrgId) return;
    const cidrs = allowedCidrsInput
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    setSecPolicySaving(true);
    const res = await setTenantSecurityPolicyAction(secPolicyOrgId, {
      allowedCidrs: cidrs,
      enforceMfa: secPolicy?.enforceMfa ?? false,
      sessionMaxAgeHours: secPolicy?.sessionMaxAgeHours ?? 8,
    });
    setSecPolicySaving(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to update security policy", description: res.message });
    } else {
      setSecPolicy(res.data);
      toast({ title: "Tenant security policy updated" });
    }
  }

  React.useEffect(() => {
    if (secPolicyOrgId) {
      handleLoadSecPolicy(secPolicyOrgId);
    }
  }, [secPolicyOrgId]);

  const filteredHealth = React.useMemo(() => {
    return healthList.filter((t) => {
      if (healthSearch.trim()) {
        const q = healthSearch.trim().toLowerCase();
        const matches = t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (healthFilter !== "all" && t.health !== healthFilter) return false;
      return true;
    });
  }, [healthList, healthSearch, healthFilter]);

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* System Health */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Health &amp; Queues</span>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {metrics?.dbHealthy ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> DB
                </span>
              ) : (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-4 w-4" /> DB Down
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">·</div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {metrics?.redisConfigured ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Redis
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Redis Off</span>
              )}
            </div>
          </div>
          {metrics?.queues ? (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Ingest: {metrics.queues.ingestion.waiting + metrics.queues.ingestion.active}</span>
              <span>·</span>
              <span>Auto: {metrics.queues.automation.waiting + metrics.queues.automation.active}</span>
              <span>·</span>
              <span>WH: {metrics.queues.webhooks.waiting + metrics.queues.webhooks.active}</span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Automated workers &amp; DB status</p>
          )}
        </div>

        {/* Organizations & Seats & RevOps */}
        <button
          onClick={() => setTab("revops")}
          className={`text-left rounded-xl border p-4 shadow-sm transition-colors ${
            tab === "revops" ? "border-primary bg-accent/20" : "bg-card hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tenants &amp; Revenue</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight flex items-baseline justify-between">
            <span>
              {metrics?.totalOrgs ?? orgs.length}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">orgs</span>
            </span>
            {revops && revops.mrr > 0 && (
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                ₹{revops.mrr.toLocaleString()}/mo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics?.totalUsers ?? 0} users · {revops?.paidAccounts ?? 0} paid accounts
          </p>
        </button>

        {/* Active Overdue Leads */}
        <button
          onClick={() => setTab("escalations")}
          className={`text-left rounded-xl border p-4 shadow-sm transition-colors ${
            tab === "escalations" ? "border-primary bg-accent/20" : "bg-card hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Missed deadlines</span>
            <AlertTriangle className={`h-4 w-4 ${(metrics?.activeEscalations ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight">
            {metrics?.activeEscalations ?? 0}
            {(metrics?.activeEscalations ?? 0) > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                Needs Attention
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Unattended leads past response deadline</p>
        </button>

        {/* DLQ Failures */}
        <button
          onClick={() => setTab("dlq")}
          className={`text-left rounded-xl border p-4 shadow-sm transition-colors ${
            tab === "dlq" ? "border-primary bg-accent/20" : "bg-card hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Failed Deliveries</span>
            <Radio className={`h-4 w-4 ${(metrics?.failedDeliveries ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight">
            {metrics?.failedDeliveries ?? 0}
            {(metrics?.failedDeliveries ?? 0) > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                Failed
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Undelivered outbound webhooks</p>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        <Button
          variant={tab === "tenants" ? "default" : "ghost"} aria-current={tab === "tenants" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("tenants")}
        >
          Organizations ({filteredOrgs.length})
        </Button>
        <Button
          variant={tab === "revops" ? "default" : "ghost"} aria-current={tab === "revops" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("revops")}
          className="gap-1.5"
        >
          <TrendingUp className="h-3.5 w-3.5" /> Revenue &amp; Billing
          {revops && revops.churnRiskCount > 0 && (
            <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-xs font-medium text-destructive">
              {revops.churnRiskCount}
            </span>
          )}
        </Button>
        <Button
          variant={tab === "support" ? "default" : "ghost"} aria-current={tab === "support" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("support")}
          className="gap-1.5"
        >
          <LifeBuoy className="h-3.5 w-3.5" /> Support Desk
          {tickets.filter((t) => t.status === "open").length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {tickets.filter((t) => t.status === "open").length}
            </span>
          )}
        </Button>
        <Button
          variant={tab === "flags" ? "default" : "ghost"} aria-current={tab === "flags" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("flags")}
          className="gap-1.5"
        >
          <Sliders className="h-3.5 w-3.5" /> Feature Flags
          {maintenance.enabled && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-600">
              Maint
            </span>
          )}
        </Button>
        <Button
          variant={tab === "compliance" ? "default" : "ghost"} aria-current={tab === "compliance" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("compliance")}
          className="gap-1.5"
        >
          <Shield className="h-3.5 w-3.5" /> Privacy &amp; Data
        </Button>
        <Button
          variant={tab === "users" ? "default" : "ghost"} aria-current={tab === "users" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("users")}
          className="gap-1.5"
        >
          Global Users ({users.length})
        </Button>
        <Button
          variant={tab === "escalations" ? "default" : "ghost"} aria-current={tab === "escalations" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("escalations")}
          className="gap-1.5"
        >
          Overdue Leads
          {escalations.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {escalations.length}
            </span>
          )}
        </Button>
        <Button
          variant={tab === "dlq" ? "default" : "ghost"} aria-current={tab === "dlq" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("dlq")}
          className="gap-1.5"
        >
          Failed Deliveries
          {dlq.length > 0 && (
            <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-xs font-medium text-destructive">
              {dlq.length}
            </span>
          )}
        </Button>
        <Button
          variant={tab === "system" ? "default" : "ghost"} aria-current={tab === "system" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("system")}
          className="gap-1.5"
        >
          <Database className="h-3.5 w-3.5" /> System &amp; Security
          {anomalies.filter((a) => a.status === "active").length > 0 && (
            <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive animate-pulse">
              {anomalies.filter((a) => a.status === "active").length} Threat{anomalies.filter((a) => a.status === "active").length > 1 ? "s" : ""}
            </span>
          )}
          {opsAlert.enabled && (
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
              Alerts ON
            </span>
          )}
        </Button>
      </div>

      {/* Tab: Organizations */}
      {tab === "tenants" && (
        <div className="space-y-4">
          {/* Org Search & Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations or slugs..."
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportOrganizationsCsv}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {selectedOrgIds.length > 0 && (
            <div className="flex items-center gap-2 bg-muted/60 px-3 py-2 rounded-xl border text-xs">
              <span className="font-medium text-foreground">{selectedOrgIds.length} selected</span>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={bulkBusy}
                onClick={() => handleBulkSuspend(true)}
              >
                <Ban className="h-3 w-3" /> Suspend
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={bulkBusy}
                onClick={() => handleBulkSuspend(false)}
              >
                <RotateCcw className="h-3 w-3" /> Reactivate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground ml-auto"
                onClick={() => setSelectedOrgIds([])}
              >
                Clear
              </Button>
            </div>
          )}

          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 cursor-pointer"
                        checked={filteredOrgs.length > 0 && filteredOrgs.every((o) => selectedOrgIds.includes(o.id))}
                        onChange={toggleSelectAllOrgs}
                        aria-label="Select all organizations"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium text-right">Users</th>
                    <th className="px-4 py-3 font-medium text-right">Leads</th>
                    <th className="px-4 py-3 font-medium">Plan &amp; Seats</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No organizations match the selected search or filters.
                      </td>
                    </tr>
                  ) : (
                    filteredOrgs.map((o) => (
                      <tr key={o.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 cursor-pointer"
                            checked={selectedOrgIds.includes(o.id)}
                            onChange={() => toggleSelectOrg(o.id)}
                            aria-label={`Select ${o.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/tenant/${o.id}`}
                            className="font-medium text-foreground hover:underline hover:text-primary transition-colors block"
                          >
                            {o.name}
                          </Link>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground font-mono">{o.slug}</span>
                            {o.attribution?.utmCampaign && (
                              <Badge variant="outline" className="text-[9px] font-mono bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 py-0 px-1">
                                {o.attribution.utmSource || "ad"}: {o.attribution.utmCampaign}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{o.userCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{o.leadCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Select value={PLANS.includes(o.plan) ? o.plan : "free"} onValueChange={(v) => changePlan(o, v)}>
                              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PLANS.map((p) => <SelectItem key={p} value={p} className="capitalize text-xs">{p}</SelectItem>)}
                                <SelectItem value="pro_trial" className="text-xs text-amber-600 font-medium">Pro (14d)</SelectItem>
                                <SelectItem value="business_trial" className="text-xs text-amber-600 font-medium">Biz (14d)</SelectItem>
                              </SelectContent>
                            </Select>
                            {o.trialEndsAt && new Date(o.trialEndsAt).getTime() > Date.now() && (
                              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30 bg-amber-500/10">
                                Trial
                              </Badge>
                            )}
                            <button
                              onClick={() => handleSetSeatOverride(o)}
                              title="Click to override seat limit"
                              className="text-xs"
                            >
                              {o.customSeats ? (
                                <Badge variant="secondary" className="text-[11px] font-normal cursor-pointer hover:bg-muted">
                                  {o.customSeats} seats
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-muted-foreground underline hover:text-foreground cursor-pointer">
                                  +Seats
                                </span>
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {o.suspended
                            ? <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">Suspended</span>
                            : <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-xs font-medium">Active</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/admin/tenant/${o.id}`}>
                              <Button variant="ghost" size="sm" className="gap-1 text-xs h-8">
                                <Eye className="h-3.5 w-3.5" /> 360
                              </Button>
                            </Link>
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleOpenAuditModal(o)} title="View organization audit trail">
                              <History className="h-3.5 w-3.5" /> Audit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                              disabled={busy === o.id}
                              onClick={() => impersonate(o.id, "/leads", true)}
                              title="View tenant dashboard safely in read-only mode"
                            >
                              View (Read-Only)
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === o.id} onClick={() => impersonate(o.id)}>
                              <LogIn className="h-3.5 w-3.5" /> Open
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className={`gap-1.5 ${o.suspended ? "" : "text-destructive hover:text-destructive"}`}
                              disabled={busy === o.id}
                              onClick={() => toggleSuspend(o)}
                            >
                              {o.suspended ? <><RotateCcw className="h-3.5 w-3.5" /> Reactivate</> : <><Ban className="h-3.5 w-3.5" /> Suspend</>}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Global Users */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, name, or organization..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            {searchingUsers && <span className="text-xs text-muted-foreground">Searching...</span>}
          </div>

          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">SuperAdmin</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No users found across any organization.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unnamed";
                      return (
                        <tr key={u.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{fullName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                          </td>
                          <td className="px-4 py-3">
                            {u.organizationName && u.organizationId ? (
                              <Link
                                href={`/admin/tenant/${u.organizationId}`}
                                className="inline-flex items-center gap-1 group"
                                title="Open Tenant 360 view"
                              >
                                <Badge variant="outline" className="font-normal text-xs group-hover:bg-primary/10 group-hover:border-primary/30 transition-colors cursor-pointer">
                                  {u.organizationName}
                                </Badge>
                              </Link>
                            ) : u.organizationName ? (
                              <Badge variant="outline" className="font-normal text-xs">
                                {u.organizationName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">None (platform)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                            {u.roleName ?? "member"}
                          </td>
                          <td className="px-4 py-3">
                            {u.isActive ? (
                              <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-xs font-medium">Active</span>
                            ) : (
                              <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">Inactive</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {u.isSuperAdmin ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                                <ShieldCheck className="h-3 w-3" /> SuperAdmin
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {u.organizationId && (
                                <>
                                  <Link href={`/admin/tenant/${u.organizationId}`}>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-xs gap-1"
                                      title="Open Tenant 360 view"
                                    >
                                      <Building2 className="h-3 w-3" /> 360
                                    </Button>
                                  </Link>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1"
                                    disabled={busy === u.id}
                                    onClick={() => impersonate(u.organizationId!, "/leads")}
                                  >
                                    <LogIn className="h-3 w-3" /> Org
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={busy === u.id}
                                onClick={() => handleToggleUserActive(u)}
                              >
                                {u.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-8 text-xs ${u.isSuperAdmin ? "text-destructive hover:text-destructive" : ""}`}
                                disabled={busy === u.id}
                                onClick={() => handleToggleSuperAdmin(u)}
                              >
                                {u.isSuperAdmin ? "Revoke Super" : "Make Super"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Overdue Leads */}
      {tab === "escalations" && (
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 bg-muted/20 border-b">
            <h3 className="text-sm font-semibold">Overdue Leads Across All Tenants</h3>
            <p className="text-xs text-muted-foreground">Leads that went past your response deadline with no salesperson contact.</p>
          </div>
          {escalations.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No active SLA escalations. All tenant leads are currently within SLA limits.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Lead Name</th>
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Escalated At</th>
                    <th className="px-4 py-3 font-medium text-right">Support Action</th>
                  </tr>
                </thead>
                <tbody>
                  {escalations.map((esc) => (
                    <tr key={esc.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{esc.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{esc.orgName}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                          {esc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(esc.escalatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busy === esc.id}
                          onClick={() => impersonate(esc.orgId, `/leads/${esc.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Impersonate &amp; Resolve
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Failed Deliveries Failures */}
      {tab === "dlq" && (
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 bg-muted/20 border-b flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Failed Webhook Deliveries (Dead Letter Queue)</h3>
              <p className="text-xs text-muted-foreground">Failed outbound integrations requiring tenant webhook endpoint inspection.</p>
            </div>
            {dlq.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={busy === "dlq_retry"}
                onClick={handleRetryAllDlq}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry All Failed
              </Button>
            )}
          </div>
          {dlq.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No failed deliveries in DLQ. Outbound webhooks are healthy.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium">Target URL</th>
                    <th className="px-4 py-3 font-medium">Error Reason</th>
                    <th className="px-4 py-3 font-medium">Failed At</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dlq.map((item) => (
                    <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{item.event}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.orgName}</td>
                      <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate" title={item.url}>
                        {item.url}
                      </td>
                      <td className="px-4 py-3 text-xs text-destructive max-w-[200px] truncate" title={item.errorReason ?? ""}>
                        {item.errorReason ?? "Unknown failure"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(item.failedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busy === item.id}
                          onClick={() => impersonate(item.orgId, "/settings/webhooks")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Inspect DLQ
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: System & Broadcast */}
      {tab === "system" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Fleet Anomaly & Threat Detection Engine */}
          <div className="lg:col-span-2 rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-muted/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    Fleet Anomaly &amp; Abuse Detection Cockpit
                    {anomalies.filter((a) => a.status === "active").length > 0 ? (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] animate-pulse">
                        {anomalies.filter((a) => a.status === "active").length} Active Threat{anomalies.filter((a) => a.status === "active").length > 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                        Fleet Clean • 0 Active Threats
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Continuous heuristic detection for data exfiltration spikes, webhook failure storms, bot injection, and suspended tenant access.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
                  <Button
                    variant={anomalyFilter === "active" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setAnomalyFilter("active")}
                  >
                    Active ({anomalies.filter((a) => a.status === "active").length})
                  </Button>
                  <Button
                    variant={anomalyFilter === "all" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setAnomalyFilter("all")}
                  >
                    All ({anomalies.length})
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={anomalyBusyId === "scan"}
                  onClick={handleScanAnomalies}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${anomalyBusyId === "scan" ? "animate-spin" : ""}`} />
                  Re-Scan Fleet
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {filteredAnomalies.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No security anomalies or abuse vectors detected matching the current filter.
                </div>
              ) : (
                filteredAnomalies.map((anom) => (
                  <div
                    key={anom.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={
                            anom.severity === "critical"
                              ? "bg-destructive text-destructive-foreground font-bold text-[10px] uppercase"
                              : anom.severity === "high"
                              ? "bg-amber-500 text-white font-bold text-[10px] uppercase"
                              : "bg-blue-500 text-white font-bold text-[10px] uppercase"
                          }
                        >
                          {anom.severity}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {anom.category.replace("_", " ")}
                        </Badge>
                        <span className="font-semibold text-sm text-foreground">{anom.title}</span>
                        <span className="text-xs text-muted-foreground">• {anom.organizationName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{anom.description}</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                        <span>
                          Metric: <strong className="text-foreground">{anom.metric.name}</strong> ({anom.metric.current} / limit {anom.metric.threshold})
                        </span>
                        <span>•</span>
                        <span>Detected: {new Date(anom.detectedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {anom.status === "active" ? (
                        <>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={anomalyBusyId === `rem-${anom.id}`}
                            onClick={() => handleRemediateAnomaly(anom.id)}
                          >
                            {anomalyBusyId === `rem-${anom.id}` ? "Mitigating..." : "Execute Remediation"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            disabled={anomalyBusyId === `res-${anom.id}`}
                            onClick={() => handleResolveAnomaly(anom.id, "dismiss")}
                          >
                            Dismiss
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground uppercase text-[10px]">
                          {anom.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Global Broadcast Announcement */}
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Megaphone className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Global Broadcast Announcement</h3>
                <p className="text-xs text-muted-foreground">
                  Displays an alert banner across all tenant dashboards simultaneously.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Announcement Message</label>
                <Input
                  placeholder="e.g. Scheduled maintenance tonight at 2:00 AM UTC (15 mins)"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium">Banner Severity</label>
                  <Select
                    value={broadcastLevel}
                    onValueChange={(v: any) => setBroadcastLevel(v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info (Primary Theme)</SelectItem>
                      <SelectItem value="warning">Warning (Amber Attention)</SelectItem>
                      <SelectItem value="destructive">Alert (Red Critical)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="text-xs font-medium mb-1">State</label>
                  <Button
                    type="button"
                    variant={broadcastActive ? "default" : "outline"}
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => setBroadcastActive(!broadcastActive)}
                  >
                    {broadcastActive ? "Active / Visible" : "Disabled / Hidden"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Target Plan Audience</label>
                  <Select
                    value={broadcastTargetPlan}
                    onValueChange={(v: any) => setBroadcastTargetPlan(v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Plans (Global)</SelectItem>
                      <SelectItem value="free">Free Plan Only</SelectItem>
                      <SelectItem value="pro">Pro Plan Only</SelectItem>
                      <SelectItem value="business">Business Plan Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium">Target Specific Tenant (Optional)</label>
                  <Select
                    value={broadcastTargetOrgId}
                    onValueChange={(v: any) => setBroadcastTargetOrgId(v)}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tenants (No Restriction)</SelectItem>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name} ({o.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(broadcastTargetPlan !== "all" || broadcastTargetOrgId !== "all") && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted/50 p-2.5 rounded-lg border border-border">
                  <span className="font-semibold text-foreground">Target Audience:</span>
                  {broadcastTargetPlan !== "all" && (
                    <Badge variant="outline" className="text-[10px] capitalize bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                      Plan: {broadcastTargetPlan}
                    </Badge>
                  )}
                  {broadcastTargetOrgId !== "all" && (
                    <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                      Tenant: {orgs.find((o) => o.id === broadcastTargetOrgId)?.name || broadcastTargetOrgId}
                    </Badge>
                  )}
                </div>
              )}

              <div className="pt-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={savingBroadcast}
                  onClick={handleSaveBroadcast}
                >
                  Save Broadcast Banner
                </Button>
              </div>
            </div>
          </div>

          {/* Database Storage & Recycle Bin */}
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Database Records &amp; Storage Maintenance</h3>
                <p className="text-xs text-muted-foreground">
                  Table row counts across all tenants and soft-deleted recycle bin purge.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 border rounded-xl bg-muted/20">
                <div className="text-xs text-muted-foreground">Active Leads</div>
                <div className="text-lg font-bold">{metrics?.storage?.leadsCount ?? 0}</div>
              </div>
              <div className="p-3 border rounded-xl bg-muted/20">
                <div className="text-xs text-muted-foreground">Timeline Activities</div>
                <div className="text-lg font-bold">{metrics?.storage?.activitiesCount ?? 0}</div>
              </div>
              <div className="p-3 border rounded-xl bg-muted/20">
                <div className="text-xs text-muted-foreground">Audit Log Entries</div>
                <div className="text-lg font-bold">{metrics?.storage?.auditLogsCount ?? 0}</div>
              </div>
              <div className="p-3 border rounded-xl bg-muted/20">
                <div className="text-xs text-muted-foreground">Webhook Deliveries</div>
                <div className="text-lg font-bold">{metrics?.storage?.webhookDeliveriesCount ?? 0}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Recycle Bin (Soft-Deleted Leads)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {metrics?.storage?.recycleBinCount ?? 0} items waiting for 30-day auto-purge
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={busy === "purge_trash" || (metrics?.storage?.recycleBinCount ?? 0) === 0}
                  onClick={handlePurgeRecycleBin}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Purge Trash Now
                </Button>
              </div>
            </div>
          </div>

          {/* Platform Ops Webhook Alerts */}
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">Platform Ops Webhook Alerts (Slack / Discord)</h3>
                  <p className="text-xs text-muted-foreground">
                    Stream critical platform events (missed deadlines, failed-delivery spikes, plan changes, data requests) to your tech team channel.
                  </p>
                </div>
              </div>
              <Badge variant={opsAlert.enabled ? "default" : "outline"} className={opsAlert.enabled ? "bg-emerald-600 text-white" : ""}>
                {opsAlert.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Incoming Webhook URL</label>
                <Input
                  placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
                  value={opsAlert.url}
                  onChange={(e) => setOpsAlert((prev) => ({ ...prev, url: e.target.value }))}
                  className="mt-1 h-9 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer border rounded-lg p-2.5 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={opsAlert.notifyOnSladeadline}
                    onChange={(e) => setOpsAlert((prev) => ({ ...prev, notifyOnSladeadline: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span>Missed deadlines</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer border rounded-lg p-2.5 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={opsAlert.notifyOnDlq}
                    onChange={(e) => setOpsAlert((prev) => ({ ...prev, notifyOnDlq: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span>Failed Deliveries</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer border rounded-lg p-2.5 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={opsAlert.notifyOnPlanChange}
                    onChange={(e) => setOpsAlert((prev) => ({ ...prev, notifyOnPlanChange: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span>Plan Changes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer border rounded-lg p-2.5 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={opsAlert.notifyOnGdpr}
                    onChange={(e) => setOpsAlert((prev) => ({ ...prev, notifyOnGdpr: e.target.checked }))}
                    className="rounded border-border"
                  />
                  <span>Data Requests</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant={opsAlert.enabled ? "outline" : "default"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setOpsAlert((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  {opsAlert.enabled ? "Disable Alerts" : "Enable Alerts"}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={testingOpsAlert || !opsAlert.url}
                    onClick={handleTestOpsAlert}
                  >
                    {testingOpsAlert ? "Pinging..." : "Test Webhook Ping"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={opsAlertSaving}
                    onClick={handleSaveOpsAlert}
                  >
                    {opsAlertSaving ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Tenant Enterprise Security Policy (IP Whitelist & Enforced MFA) */}
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Lock className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">Tenant Enterprise Security Policy (IP Whitelisting &amp; MFA)</h3>
                <p className="text-xs text-muted-foreground">
                  Enforce strict network CIDR restrictions and two-factor authentication requirements for enterprise client accounts.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Select Organization</label>
                <Select value={secPolicyOrgId} onValueChange={(val) => handleLoadSecPolicy(val)}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder="Select Organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.name} ({o.slug}) — Plan: {o.plan.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Allowed Corporate IP / CIDR Ranges</label>
                <Input
                  placeholder="e.g. 192.168.1.0/24, 10.0.0.1, 203.0.113.50 (leave empty for unconstrained)"
                  value={allowedCidrsInput}
                  onChange={(e) => setAllowedCidrsInput(e.target.value)}
                  className="mt-1 h-9 text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Comma-separated IPv4/IPv6 CIDR addresses.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer border rounded-lg p-2.5 bg-muted/20 flex-1">
                  <input
                    type="checkbox"
                    checked={secPolicy?.enforceMfa ?? false}
                    onChange={(e) => setSecPolicy((prev) => (prev ? { ...prev, enforceMfa: e.target.checked } : null))}
                    className="rounded border-border"
                  />
                  <div>
                    <div className="text-xs font-medium">Enforce Two-Factor Authentication (2FA)</div>
                    <div className="text-[11px] text-muted-foreground">Requires MFA for all team members under this tenant.</div>
                  </div>
                </label>

                <div className="border rounded-lg p-2.5 bg-muted/20 w-full sm:w-48 space-y-1">
                  <label className="text-xs font-medium">Session Max Age (Hours)</label>
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    value={secPolicy?.sessionMaxAgeHours ?? 8}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setSecPolicy((prev) => (prev ? { ...prev, sessionMaxAgeHours: isNaN(v) ? 8 : v } : null));
                    }}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={secPolicySaving || secPolicyLoading || !secPolicyOrgId}
                  onClick={handleSaveSecPolicy}
                >
                  {secPolicySaving ? "Saving Policy..." : "Update Security Policy"}
                </Button>
              </div>
            </div>
          </div>

          {/* 1-Click Platform CSV Exporters Card */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">1-Click Platform Data Exporters</h3>
                <p className="text-xs text-muted-foreground">
                  Generate instant CSV snapshots for executive reporting, financial reconciliation, and sales re-engagement.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleExportCsv("tenants")}
              >
                <Download className="h-3.5 w-3.5" /> Tenants Directory (.csv)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleExportCsv("financial")}
              >
                <Download className="h-3.5 w-3.5" /> Financial Billing Ledger (.csv)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleExportCsv("churn")}
              >
                <Download className="h-3.5 w-3.5" /> Cancellation Risk &amp; Usage Data (.csv)
              </Button>
            </div>
          </div>

          {/* Security Session Killswitch Card */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <UserX className="h-5 w-5 text-destructive" />
              <div>
                <h3 className="text-sm font-semibold">Security Emergency Session Killswitch</h3>
                <p className="text-xs text-muted-foreground">
                  Immediately terminate all active session tokens for a compromised user or an entire tenant organization.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
                <div className="text-xs font-semibold">Terminate User Sessions</div>
                <div className="flex gap-2">
                  <Select onValueChange={(userId) => handleRevokeUserSession(userId)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select user to sign out" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.slice(0, 30).map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.email} ({u.organizationName ?? "No Org"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">Forces selected user to immediately log back in.</p>
              </div>

              <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
                <div className="text-xs font-semibold">Terminate All Organization Sessions</div>
                <div className="flex gap-2">
                  <Select onValueChange={(orgId) => handleRevokeOrgSession(orgId)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select tenant to sign out" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          {o.name} ({o.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">Forces all users in selected tenant to sign out instantly.</p>
              </div>
            </div>
          </div>

          {/* Fleet API Key & Integration Inspector Card */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" /> Cross-Tenant API Key &amp; Integration Inspector
                </h3>
                <p className="text-xs text-muted-foreground">
                  Inspect REST API credentials issued across all organizations, scopes, and revocation status.
                </p>
              </div>
              <Badge variant="outline">{apiKeys.length} Issued Keys</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Key Name</th>
                    <th className="p-3">Organization</th>
                    <th className="p-3">Key Prefix</th>
                    <th className="p-3">Scope</th>
                    <th className="p-3">Last Used</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No active API keys found across organizations.
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-5 font-semibold text-foreground">{k.name}</td>
                        <td className="p-3 text-muted-foreground">{k.orgName ?? "Unknown Org"}</td>
                        <td className="p-3 font-mono text-muted-foreground">{k.prefix}...</td>
                        <td className="p-3">
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {k.scope}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                        </td>
                        <td className="p-3">
                          {k.revokedAt ? (
                            <Badge variant="outline" className="text-destructive border-destructive/20">
                              Revoked
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                              Active
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 pr-5 text-right">
                          {!k.revokedAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                              onClick={() => handleRevokeFleetKey(k.id)}
                            >
                              Revoke Key
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* White-Label Custom Domain & CNAME SSL Manager */}
          <div className="lg:col-span-2 rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> White-Label Custom Domains &amp; CNAME Routing
                </h3>
                <p className="text-xs text-muted-foreground">
                  Manage tenant custom domain hostnames (e.g. crm.clientagency.com), automated SSL certificate status, and DNS CNAME targets.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setDomainModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Map Custom Domain
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Custom Domain (FQDN)</th>
                    <th className="p-3">Organization</th>
                    <th className="p-3">CNAME Target</th>
                    <th className="p-3">SSL Status</th>
                    <th className="p-3">DNS Verified</th>
                    <th className="p-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {domains.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No custom domains mapped yet across tenant fleet.
                      </td>
                    </tr>
                  ) : (
                    domains.map((dom) => (
                      <tr key={dom.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-5 font-mono font-semibold text-foreground flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-primary" />
                          {dom.domain}
                        </td>
                        <td className="p-3 text-muted-foreground">{dom.orgName}</td>
                        <td className="p-3 font-mono text-muted-foreground">{dom.cnameTarget}</td>
                        <td className="p-3">
                          <Badge
                            className={
                              dom.sslStatus === "active"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px]"
                            }
                          >
                            SSL {dom.sslStatus.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {dom.verified ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" /> Pending DNS
                            </span>
                          )}
                        </td>
                        <td className="p-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!dom.verified && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => handleVerifyDomain(dom.id)}
                              >
                                Verify CNAME
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveDomain(dom.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Platform Fleet Activity Log Panel */}
          <div className="lg:col-span-2 rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Platform Operator Activity Trail
                </h3>
                <p className="text-xs text-muted-foreground">
                  Fleet-wide audit log of administrative and super-admin actions executed across all tenant organizations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{activity.length} Events</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={activityLoading}
                  onClick={handleRefreshActivity}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${activityLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Timestamp</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Target Organization</th>
                    <th className="p-3">Operator</th>
                    <th className="p-3 pr-5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No platform operator actions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    activity.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono text-[10px] uppercase">
                            {item.action}
                          </Badge>
                        </td>
                        <td className="p-3 font-medium text-foreground">
                          {item.orgName ? (
                            <span>{item.orgName}</span>
                          ) : item.orgId ? (
                            <span className="font-mono text-[11px] text-muted-foreground">{item.orgId.slice(0, 8)}...</span>
                          ) : (
                            <span className="text-muted-foreground">Global</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {item.actorName || item.actorEmail || "System"}
                        </td>
                        <td className="p-3 pr-5 text-muted-foreground font-mono text-[11px] max-w-xs truncate">
                          {item.metadata && Object.keys(item.metadata).length > 0
                            ? JSON.stringify(item.metadata)
                            : item.entityType ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: GDPR & DPDP Compliance Data Request */}
      {tab === "compliance" && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <div className="border-b pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Delete Personal Data &amp; Data Requests (GDPR / DPDP)
              </h3>
              <p className="text-xs text-muted-foreground">
                Search, export data dossiers, and permanently anonymize personal contact data across all tenant databases to fulfill legal compliance requests.
              </p>
            </div>

            {/* Data Request Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter email address, phone number, or full name..."
                  value={dsrQuery}
                  onChange={(e) => setDsrQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchDsr()}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Button size="sm" className="h-9 text-xs gap-1" disabled={dsrSearching} onClick={handleSearchDsr}>
                {dsrSearching ? "Searching..." : "Search Subject"}
              </Button>
            </div>

            {/* Legal Notice Callout */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 text-xs text-muted-foreground flex gap-2.5">
              <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">Compliance Preservation Guarantee:</span> Executing
                a Delete Personal Data replaces personal identifiers (name, phone, email, notes, custom fields) with
                anonymized tokens while retaining CRM deal counts and revenue metrics.
              </div>
            </div>

            {/* Results Table */}
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-4">Tenant</th>
                    <th className="p-3">Subject Name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dsrResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        {dsrQuery ? "No matches found for that query." : "Search by phone number or email above to look up records."}
                      </td>
                    </tr>
                  ) : (
                    dsrResults.map((subject) => (
                      <tr key={subject.id} className="hover:bg-muted/25 transition-colors">
                        <td className="p-3 pl-4">
                          <div className="font-semibold text-foreground">{subject.orgName}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{subject.orgSlug}</div>
                        </td>
                        <td className="p-3 font-medium">
                          {subject.name}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {subject.phone || "—"}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {subject.email || "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize text-[10px]">
                            {subject.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(subject.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              disabled={dsrBusyId === subject.id}
                              onClick={() => handleExportDsr(subject.id, subject.name)}
                            >
                              <Download className="h-3 w-3" /> Export Dossier
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              disabled={dsrBusyId === subject.id || subject.name === "[REDACTED_GDPR]"}
                              onClick={() => handleExecuteRightToBeForgotten(subject.id, subject.name)}
                            >
                              <Trash2 className="h-3 w-3" /> Delete Personal Data
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Whole-Tenant Offboarding & Hard-Delete (DPDP / GDPR) */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4 border-destructive/20">
            <div className="border-b pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" /> Full Tenant Removal &amp; Data Erasure (GDPR Art. 17 / DPDP)
              </h3>
              <p className="text-xs text-muted-foreground">
                When a tenant cancels and requests full data portability or hard erasure, export a complete structured JSON dossier or permanently erase all tenant records across the database.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Select Organization
                </label>
                <Select value={offboardOrgId} onValueChange={setOffboardOrgId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select an organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    {initial.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.name} ({o.slug}) — {o.plan}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2 pt-1 sm:pt-5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5"
                  disabled={exportingTenantDossier || !offboardOrgId}
                  onClick={() => handleExportTenantDossier(offboardOrgId)}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportingTenantDossier ? "Exporting report..." : "Export Full Report (JSON)"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9 text-xs gap-1.5"
                  disabled={!offboardOrgId}
                  onClick={() => {
                    setHardDeleteConfirmInput("");
                    setHardDeleteModalOpen(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hard Delete Tenant
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-muted-foreground flex gap-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">Irreversible Compliance Guardrail:</span> Hard deletion requires typing the target organization&apos;s exact slug. Deletion will cascade through all users, leads, activities, follow-ups, invoices, integrations, and platform configurations inside a strict transactional boundary.
              </div>
            </div>
          </div>

          {/* Auto-Retention Policy for Long-Suspended Workspaces */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Auto-Retention Policy (Suspended Workspaces)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Workspaces suspended for &gt;166 days receive an automated email warning; workspaces suspended &gt;180 days have customer PII permanently anonymized via worker cron.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 shrink-0"
                disabled={runningRetentionScan}
                onClick={handleRunRetentionScan}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${runningRetentionScan ? "animate-spin" : ""}`} />
                {runningRetentionScan ? "Scanning..." : "Run Retention Scan Now"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border bg-muted/30 p-3">
                <span className="text-muted-foreground block text-[11px]">Retention Limit</span>
                <span className="text-sm font-semibold text-foreground">180 Days</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Fixed auto-anonymization ceiling</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <span className="text-muted-foreground block text-[11px]">Warning Trigger</span>
                <span className="text-sm font-semibold text-foreground">14 Days Prior (Day 166)</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Email notification sent to owner</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <span className="text-muted-foreground block text-[11px]">Cleanup job</span>
                <span className="text-sm font-semibold text-foreground">Runs daily</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Reuses the personal-data deletion engine</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: RevOps & Cancellation Health */}
      {tab === "revops" && (
        <div className="space-y-6">
          {/* Executive RevOps KPI Bar */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Monthly Recurring
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                ₹{revops?.mrr ? revops.mrr.toLocaleString() : 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Active Monthly Revenue run rate</p>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Annual Run Rate (ARR)
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">
                ₹{revops?.arr ? revops.arr.toLocaleString() : 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">12x annualized Monthly Revenue</p>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ARPU (Avg Revenue)
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">
                ₹{revops?.arpu ? revops.arpu.toLocaleString() : 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Per active paid account</p>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Paid Accounts
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">
                {revops?.paidAccounts ?? 0}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / {(revops?.paidAccounts ?? 0) + (revops?.freeAccounts ?? 0)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{revops?.freeAccounts ?? 0} on free tier</p>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cancellation Danger Index
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {revops?.churnRiskCount ?? 0}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Tenants inactive &gt;7 days</p>
            </div>
          </div>

          {/* Monthly Revenue Waterfall & Revenue Dynamics Card */}
          {revops?.waterfall && (
            <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3 gap-2">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Monthly Revenue Waterfall &amp; Revenue Expansion Dynamics
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Breakdown of monthly recurring revenue flow: baseline retention, new acquisition, tier upgrades, and churn exposure.
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  Net Monthly Revenue: ₹{revops.waterfall.netMrr.toLocaleString()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase">Starting Monthly Revenue</div>
                  <div className="text-lg font-bold mt-1 text-foreground">
                    ₹{revops.waterfall.startingMrr.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Carryover base</p>
                </div>

                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase">
                    (+) New Monthly Revenue
                  </div>
                  <div className="text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                    +₹{revops.waterfall.newMrr.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground">&lt;30d acquisitions</p>
                </div>

                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                  <div className="text-[11px] font-medium text-blue-700 dark:text-blue-400 uppercase">
                    (+) Expansion
                  </div>
                  <div className="text-lg font-bold mt-1 text-blue-600 dark:text-blue-400">
                    +₹{revops.waterfall.expansionMrr.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Business tier deltas</p>
                </div>

                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <div className="text-[11px] font-medium text-destructive uppercase">(-) Cancellation Risk</div>
                  <div className="text-lg font-bold mt-1 text-destructive">
                    -₹{revops.waterfall.churnRiskMrr.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground">At-risk tenant exposure</p>
                </div>

                <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
                  <div className="text-[11px] font-medium text-primary uppercase">(=) Net Run Rate</div>
                  <div className="text-lg font-bold mt-1 text-foreground">
                    ₹{revops.waterfall.netMrr.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground">End of period Monthly Revenue</p>
                </div>
              </div>
            </div>
          )}

          {/* Signup -> Activation -> Paid Funnel Card */}
          {revops?.funnel && (
            <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3 gap-2">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Signup → Activation → Paid Funnel
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cohort conversion rates for last 30 days of tenant signups: dropoffs between onboarding, lead creation, and paid tiers.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    Activation: {revops.funnel.activationRate}%
                  </Badge>
                  <Badge variant="outline" className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    Paid: {revops.funnel.paidConversionRate}%
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {revops.funnel.stages.map((stage) => {
                  const isDropoff = stage.dropoffRate !== undefined && stage.dropoffRate > 0;
                  return (
                    <div key={stage.stage} className="rounded-lg border bg-muted/30 p-3 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground uppercase">
                          <span>{stage.label}</span>
                          <span className="font-mono text-foreground font-semibold">{stage.rate}%</span>
                        </div>
                        <div className="text-2xl font-bold mt-1 text-foreground">
                          {stage.count}
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              stage.stage === "churned"
                                ? "bg-destructive"
                                : stage.stage === "paid"
                                ? "bg-emerald-500"
                                : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(stage.rate, stage.count > 0 ? 4 : 0))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{stage.stage === "signed_up" ? "Cohort base" : `${stage.rate}% of signups`}</span>
                          {isDropoff && (
                            <span className="text-destructive font-medium">-{stage.dropoffRate}% drop</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subscription Payment & Dunning Fleet Inspector Card */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Subscription Payment &amp; Dunning Fleet Inspector
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Live account-by-account payment status, 7-day grace period countdowns, automated dunning dispatch, and delinquency feature locking.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={refreshBillingFleet}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh Fleet
                  </Button>
                </div>
              </div>

              {/* Search & Status Filter Pills */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tenant by name, slug, or failure reason..."
                    value={billingSearch}
                    onChange={(e) => setBillingSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["all", "paid", "grace_period", "locked", "pending", "free"] as const).map((statusVal) => {
                    const count =
                      statusVal === "all"
                        ? billingList.length
                        : billingList.filter((b) => b.status === statusVal).length;
                    const labels: Record<string, string> = {
                      all: "All Accounts",
                      paid: "Paid",
                      grace_period: "Grace Period",
                      locked: "Locked / Delinquent",
                      pending: "Pending Checkout",
                      free: "Free Tier",
                    };
                    return (
                      <Button
                        key={statusVal}
                        variant={billingFilter === statusVal ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setBillingFilter(statusVal)}
                      >
                        {labels[statusVal]} ({count})
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Billing Fleet Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Tenant</th>
                    <th className="p-3">Plan &amp; Gateway</th>
                    <th className="p-3">Payment Status</th>
                    <th className="p-3">Failed &amp; Overdue Payments</th>
                    <th className="p-3">Next Renewal / Expiry</th>
                    <th className="p-3 pr-5 text-right">Lifecycle Overrides</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBilling.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        No organizations found matching the payment filter.
                      </td>
                    </tr>
                  ) : (
                    filteredBilling.map((b) => {
                      const isGrace = b.status === "grace_period";
                      const isLocked = b.status === "locked";
                      const isPaid = b.status === "paid";
                      const isPending = b.status === "pending";
                      return (
                        <tr key={b.orgId} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 pl-5">
                            <Link
                              href={`/admin/tenant/${b.orgId}`}
                              className="font-semibold text-foreground hover:underline hover:text-primary transition-colors block"
                            >
                              {b.orgName}
                            </Link>
                            <div className="text-[11px] text-muted-foreground font-mono">{b.slug}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="capitalize text-[11px]">
                                {b.plan}
                              </Badge>
                              {b.razorpaySubscriptionId ? (
                                <span
                                  className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]"
                                  title={b.razorpaySubscriptionId}
                                >
                                  {b.razorpaySubscriptionId}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="p-3">
                            {isPaid && (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                                {b.manualPaidUntil ? "Paid (Offline)" : "Active / Paid"}
                              </Badge>
                            )}
                            {isGrace && (
                              <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 animate-pulse">
                                Grace ({b.daysRemainingInGrace}d remaining)
                              </Badge>
                            )}
                            {isLocked && (
                              <Badge className="bg-destructive/15 text-destructive border-destructive/30">
                                <Lock className="h-3 w-3 mr-1" /> Locked (Delinquent)
                              </Badge>
                            )}
                            {isPending && (
                              <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
                                Pending Checkout
                              </Badge>
                            )}
                            {b.status === "free" && (
                              <Badge variant="outline" className="text-muted-foreground">
                                Free Tier
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            {b.failureReason ? (
                              <div className="space-y-0.5">
                                <div
                                  className="text-destructive font-medium truncate max-w-[180px]"
                                  title={b.failureReason}
                                >
                                  {b.failureReason}
                                </div>
                                {b.dunningSentAt && (
                                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Mail className="h-2.5 w-2.5" /> reminders sent{" "}
                                    {new Date(b.dunningSentAt).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {b.gracePeriodEndsAt ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                Grace ends {new Date(b.gracePeriodEndsAt).toLocaleDateString()}
                              </span>
                            ) : b.manualPaidUntil ? (
                              <span>Paid until {new Date(b.manualPaidUntil).toLocaleDateString()}</span>
                            ) : b.currentPeriodEnd ? (
                              <span>{new Date(b.currentPeriodEnd).toLocaleDateString()}</span>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td className="p-3 pr-5 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {(isGrace || isLocked) && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-300 border-amber-500/30"
                                    disabled={billingBusyId === `extend-${b.orgId}`}
                                    onClick={() => handleExtendGrace(b.orgId)}
                                    title="Add 7 extra days of grace period"
                                  >
                                    +7d Grace
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] gap-1"
                                    disabled={billingBusyId === `dunning-${b.orgId}`}
                                    onClick={() => handleSendDunning(b.orgId)}
                                    title="Send dunning notice email & in-app alert"
                                  >
                                    <Mail className="h-3 w-3" /> Mail Alert
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                disabled={billingBusyId === `paid-${b.orgId}`}
                                onClick={() => handleMarkPaid(b.orgId)}
                                title="Mark account manually paid offline for 30 days"
                              >
                                Mark Paid
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                                disabled={billingBusyId === `sim-${b.orgId}`}
                                onClick={() => handleSimulateFailure(b.orgId)}
                                title="Simulate payment failure to test grace period & dunning"
                              >
                                Test Fail
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tenant Cancellation Risk & Health Predictor Card */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-primary" /> Tenant Cancellation Risk &amp; Usage Quota Predictor
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Real-time engagement telemetry detecting slowing and at-risk accounts with instant support impersonation and credit grants.
                  </p>
                </div>
              </div>

              {/* Health Search & Filter */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tenant by name or slug..."
                    value={healthSearch}
                    onChange={(e) => setHealthSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["all", "healthy", "slowing", "at_risk", "critical"] as const).map((filterVal) => {
                    const count =
                      filterVal === "all"
                        ? healthList.length
                        : healthList.filter((h) => h.health === filterVal).length;
                    return (
                      <Button
                        key={filterVal}
                        variant={healthFilter === filterVal ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2.5 capitalize"
                        onClick={() => setHealthFilter(filterVal)}
                      >
                        {filterVal.replace("_", " ")} ({count})
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Health Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Tenant</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Health Status</th>
                    <th className="p-3">Activity</th>
                    <th className="p-3">Volume</th>
                    <th className="p-3">AI Credits</th>
                    <th className="p-3">WhatsApp Credits</th>
                    <th className="p-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredHealth.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No organizations found matching the filter.
                      </td>
                    </tr>
                  ) : (
                    filteredHealth.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-5">
                          <Link
                            href={`/admin/tenant/${tenant.id}`}
                            className="font-semibold text-foreground hover:underline hover:text-primary transition-colors block"
                          >
                            {tenant.name}
                          </Link>
                          <div className="text-[11px] text-muted-foreground font-mono">{tenant.slug}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize text-[11px]">
                            {tenant.plan}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {tenant.health === "healthy" && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20">
                              Healthy
                            </Badge>
                          )}
                          {tenant.health === "slowing" && (
                            <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20">
                              Slowing
                            </Badge>
                          )}
                          {tenant.health === "at_risk" && (
                            <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20">
                              At Risk
                            </Badge>
                          )}
                          {tenant.health === "critical" && (
                            <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">
                              Critical Cancellation
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {tenant.daysInactive === 0 ? "Today" : `${tenant.daysInactive}d ago`}
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-foreground">{tenant.leadCount}</span> leads ·{" "}
                          <span className="font-medium text-foreground">{tenant.userCount}</span> users
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 font-mono font-medium">
                            <Zap className="h-3 w-3 text-amber-500" />
                            {tenant.aiCredits.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 font-mono font-medium">
                            <Radio className="h-3 w-3 text-emerald-500" />
                            {tenant.whatsappCredits.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/admin/tenant/${tenant.id}`}>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 shadow-sm"
                              >
                                <Eye className="h-3 w-3" /> 360 View
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => {
                                setCreditModalOrg(tenant);
                                setAiGrantAmount("500");
                                setWhatsappGrantAmount("250");
                              }}
                            >
                              <Plus className="h-3 w-3" /> Grant Credits
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              disabled={busy === tenant.id}
                              onClick={() => impersonate(tenant.id)}
                            >
                              <LogIn className="h-3 w-3" /> Impersonate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* GST Tax Invoicing & Billing Ledger Card */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" /> GST Tax Invoices &amp; B2B Billing Ledger
                </h3>
                <p className="text-xs text-muted-foreground">
                  Sequential tax-compliant invoice generator (SAC 998313, 18% GST breakdown) with audit trails.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setInvoiceModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Issue Tax Invoice
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Invoice #</th>
                    <th className="p-3">Tenant Organization</th>
                    <th className="p-3">Plan &amp; SAC</th>
                    <th className="p-3">Base Amount</th>
                    <th className="p-3">GST (18%)</th>
                    <th className="p-3">Total Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Issued Date</th>
                    <th className="p-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        No tax invoices recorded yet. Click &quot;Issue Tax Invoice&quot; to generate one.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-5 font-mono font-semibold text-foreground">{inv.invoiceNumber}</td>
                        <td className="p-3">
                          <Link
                            href={`/admin/tenant/${inv.orgId}`}
                            className="font-medium text-foreground hover:underline hover:text-primary transition-colors block"
                          >
                            {inv.orgName}
                          </Link>
                          {inv.gstin && <div className="text-[10px] text-muted-foreground font-mono">GSTIN: {inv.gstin}</div>}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize text-[11px]">
                            {inv.plan}
                          </Badge>
                          <span className="ml-1 text-[10px] text-muted-foreground font-mono">{inv.sacCode}</span>
                        </td>
                        <td className="p-3 font-mono">₹{inv.amount.toLocaleString()}</td>
                        <td className="p-3 font-mono text-muted-foreground">₹{inv.taxAmount.toLocaleString()}</td>
                        <td className="p-3 font-mono font-bold text-foreground">₹{inv.totalAmount.toLocaleString()}</td>
                        <td className="p-3">
                          {inv.type === "credit_note" ? (
                            <Badge variant="outline" className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30">
                              Credit Note
                            </Badge>
                          ) : inv.status === "refunded" ? (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              Refunded
                            </Badge>
                          ) : inv.status === "paid" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                              Paid
                            </Badge>
                          ) : inv.status === "issued" ? (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              Issued
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Void
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(inv.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inv.status === "paid" && inv.type !== "credit_note" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-purple-600 hover:bg-purple-500/10"
                                onClick={() => handleIssueCreditNote(inv)}
                                title="Issue GST Credit Note / Refund"
                              >
                                Credit Note
                              </Button>
                            )}
                            {inv.status !== "void" && inv.status !== "refunded" && inv.type !== "credit_note" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                                onClick={() => handleVoidInvoice(inv.id)}
                              >
                                Void
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Coupons & Promo Codes Engine Card */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" /> Coupons &amp; Promotional Discounts Engine
                </h3>
                <p className="text-xs text-muted-foreground">
                  Create discount voucher codes, manage redemption caps, and incentivize customer acquisition.
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCouponModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Create Promo Code
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                    <th className="p-3 pl-5">Coupon Code</th>
                    <th className="p-3">Discount</th>
                    <th className="p-3">Eligible Plans</th>
                    <th className="p-3">Redemptions</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No promotional discount codes created yet.
                      </td>
                    </tr>
                  ) : (
                    coupons.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 pl-5 font-mono font-bold text-foreground tracking-wider">{c.code}</td>
                        <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                          {c.discountType === "percent" ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {c.plans.map((p) => (
                              <Badge key={p} variant="outline" className="capitalize text-[10px]">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {c.redemptionsCount} / {c.maxRedemptions > 0 ? c.maxRedemptions : "Unlimited"}
                        </td>
                        <td className="p-3">
                          <Badge
                            className={
                              c.active
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {c.active ? "Active" : "Disabled"}
                          </Badge>
                        </td>
                        <td className="p-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleToggleCoupon(c.id, !c.active)}
                            >
                              {c.active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteCoupon(c.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Automated Executive Email Digest Card */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    Automated Executive Email Digest
                    {digestConfig.enabled ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                        Active • {digestConfig.frequency.toUpperCase()}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        Disabled
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Delivers scheduled KPI briefings (ARR, tenant velocity, churn risks, DLQ status) directly to leadership inboxes.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={digestBusy}
                  onClick={handleTriggerLiveDigest}
                >
                  <Send className="h-3.5 w-3.5" />
                  Dispatch Now
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={digestBusy}
                  onClick={handleSaveDigest}
                >
                  {digestBusy ? "Saving..." : "Save Schedule"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Schedule Automation</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={digestConfig.enabled ? "default" : "outline"}
                    size="sm"
                    className="h-9 flex-1 text-xs"
                    onClick={() => setDigestConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  >
                    {digestConfig.enabled ? "Automation Enabled" : "Automation Paused"}
                  </Button>
                  <Select
                    value={digestConfig.frequency}
                    onValueChange={(val: "daily" | "weekly") => setDigestConfig((prev) => ({ ...prev, frequency: val }))}
                  >
                    <SelectTrigger className="h-9 w-[110px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Last delivered: {digestConfig.lastSentAt ? new Date(digestConfig.lastSentAt).toLocaleString() : "Never"}
                </p>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-foreground">
                  Leadership Recipients (Comma-separated emails)
                </label>
                <Input
                  placeholder="founder@company.com, cto@company.com, ops@company.com"
                  value={digestRecipientsInput}
                  onChange={(e) => setDigestRecipientsInput(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave blank to automatically default to all SuperAdmin accounts.
                </p>
              </div>
            </div>

            {/* Test preview dispatch */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t bg-muted/20 p-3 rounded-lg text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Inbox className="h-4 w-4 text-primary" />
                <span>Send a one-click test briefing to any inbox to verify delivery formatting:</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Input
                  placeholder="name@example.com"
                  value={testDigestEmail}
                  onChange={(e) => setTestDigestEmail(e.target.value)}
                  className="h-8 text-xs font-mono w-full sm:w-60"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs whitespace-nowrap"
                  disabled={digestBusy || !testDigestEmail.trim()}
                  onClick={handleSendTestDigest}
                >
                  Send Preview
                </Button>
              </div>
            </div>
          </div>

          {/* Growth Campaigns & Attribution Performance */}
          <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Growth Campaigns &amp; Conversion Attribution
                </h3>
                <p className="text-xs text-muted-foreground">
                  Multi-touch tracking for ad campaigns (Meta, Google, Affiliates) capturing UTM parameters, click IDs, and paid tenant conversions.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs w-fit">
                {campaignStats?.campaigns?.length ?? 0} Active Channels
              </Badge>
            </div>

            {/* Campaign KPI Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium uppercase">Attributed Signups</span>
                <div className="text-xl font-bold text-primary">
                  {campaignStats?.attributedSignups ?? 0}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    / {campaignStats?.totalSignups ?? 0}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {Math.round(((campaignStats?.attributedSignups ?? 0) / (campaignStats?.totalSignups || 1)) * 100)}% ad attributed
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium uppercase">Campaign Monthly Revenue</span>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{(campaignStats?.attributedMrr ?? 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground">Generated by ad traffic</div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium uppercase">Direct &amp; Organic</span>
                <div className="text-xl font-bold text-foreground">
                  {campaignStats?.directSignups ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Word of mouth / referral</div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium uppercase">Conversions Dispatch Status</span>
                <div className="text-xl font-bold flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      capiConfig.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                    }`}
                  />
                  <span className="text-sm">
                    {capiConfig.enabled ? "Live Active" : "Paused"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">Server-to-server tracking</div>
              </div>
            </div>

            {/* Campaign Breakdown Table */}
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left font-medium border-b">
                      <th className="p-3 pl-4">Campaign Name</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Medium</th>
                      <th className="p-3 text-right">Signups</th>
                      <th className="p-3 text-right">Paid Tenants</th>
                      <th className="p-3 text-right">Conv. Rate</th>
                      <th className="p-3 pr-4 text-right">Monthly Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(!campaignStats?.campaigns || campaignStats.campaigns.length === 0) ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No ad campaign signups recorded yet. Run ads with URL parameters:{" "}
                          <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">
                            ?utm_source=meta&amp;utm_campaign=launch2026
                          </code>
                        </td>
                      </tr>
                    ) : (
                      campaignStats.campaigns.map((c, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 pl-4 font-semibold text-foreground flex items-center gap-1.5">
                            <Megaphone className="h-3 w-3 text-primary" />
                            {c.campaign}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {c.source}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{c.medium}</td>
                          <td className="p-3 text-right font-semibold tabular-nums">{c.signups}</td>
                          <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {c.paidTenants}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums">{c.conversionRate}%</td>
                          <td className="p-3 pr-4 text-right font-bold text-foreground tabular-nums">
                            ₹{c.mrr.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Meta Conversions API (Conversions) & Server-Side Ad Engine */}
          <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" /> Meta Conversions API (Conversions) Server-Side Tracking
                </h3>
                <p className="text-xs text-muted-foreground">
                  Dispatches server-to-server <code className="bg-muted px-1 rounded font-mono">CompleteRegistration</code> and <code className="bg-muted px-1 rounded font-mono">Subscribe</code> events to Meta Graph API, bypassing ad-blockers and iOS 14.5+ ATT restrictions.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={capiConfig.enabled ? "default" : "outline"}
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setCapiConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                >
                  <Power className="h-3.5 w-3.5" />
                  {capiConfig.enabled ? "Conversions Enabled" : "Conversions Disabled"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  disabled={testingCapi || !capiConfig.pixelId || !capiConfig.accessToken}
                  onClick={handleTestCapiPing}
                >
                  <Send className="h-3.5 w-3.5" />
                  {testingCapi ? "Pinging Meta..." : "Send Test Ping"}
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={savingCapi}
                  onClick={handleSaveCapi}
                >
                  {savingCapi ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Meta Pixel / Dataset ID</label>
                <Input
                  placeholder="e.g. 123456789012345"
                  value={capiConfig.pixelId}
                  onChange={(e) => setCapiConfig((prev) => ({ ...prev, pixelId: e.target.value.trim() }))}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Found in Meta Events Manager &gt; Settings.</p>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Conversions System User Access Token</label>
                <PasswordInput
                  placeholder="EAAG..."
                  value={capiConfig.accessToken}
                  onChange={(e) => setCapiConfig((prev) => ({ ...prev, accessToken: e.target.value.trim() }))}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Generate in Meta Events Manager &gt; Conversions API.</p>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Test Event Code (Optional)</label>
                <Input
                  placeholder="e.g. TEST12345"
                  value={capiConfig.testEventCode || ""}
                  onChange={(e) => setCapiConfig((prev) => ({ ...prev, testEventCode: e.target.value.trim() }))}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Test Events tab in Meta Events Manager for sandbox validation.</p>
              </div>
            </div>

            {/* Live Conversions Dispatch Event Stream */}
            <div className="pt-2">
              <div className="text-xs font-semibold text-foreground mb-2 flex items-center justify-between">
                <span>Recent Server-Side Conversions Dispatches</span>
                <span className="text-[10px] text-muted-foreground font-normal">Last {capiLogs.length} events logged</span>
              </div>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left font-medium border-b">
                      <th className="p-2.5 pl-3">Event Name</th>
                      <th className="p-2.5">Organization / User</th>
                      <th className="p-2.5">Meta API Status</th>
                      <th className="p-2.5 pr-3 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {capiLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          No Conversions events dispatched yet. Click &quot;Send Test Ping&quot; above to verify connectivity.
                        </td>
                      </tr>
                    ) : (
                      capiLogs.slice(0, 10).map((log) => (
                        <tr key={log.id} className="hover:bg-muted/20">
                          <td className="p-2.5 pl-3 font-mono font-semibold text-foreground flex items-center gap-1.5">
                            <Activity className="h-3 w-3 text-primary" />
                            {log.eventName}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {log.orgName || log.email || log.orgId || "Anonymous Visitor"}
                          </td>
                          <td className="p-2.5">
                            <Badge
                              variant="outline"
                              className={`text-[9px] font-mono ${
                                log.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : log.status === "skipped"
                                  ? "text-muted-foreground"
                                  : "bg-destructive/10 text-destructive border-destructive/30"
                              }`}
                            >
                              {log.status.toUpperCase()} {log.httpCode ? `(${log.httpCode})` : ""}
                            </Badge>
                          </td>
                          <td className="p-2.5 pr-3 text-right font-mono text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Support Desk & Incident Queue */}
      {tab === "support" && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-primary" /> SuperAdmin Support Desk &amp; Incident Dispatch
                </h3>
                <p className="text-xs text-muted-foreground">
                  Centralized queue for tenant issues, billing disputes, and technical assistance.
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["all", "open", "in_progress", "resolved"] as const).map((s) => {
                  const count = s === "all" ? tickets.length : tickets.filter((t) => t.status === s).length;
                  const labels: Record<string, string> = {
                    all: "All",
                    open: "Open",
                    in_progress: "In Progress",
                    resolved: "Resolved",
                  };
                  return (
                    <Button
                      key={s}
                      variant={ticketFilter === s ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2.5 capitalize"
                      onClick={() => setTicketFilter(s)}
                    >
                      {labels[s]} ({count})
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border min-h-[480px]">
              {/* Left Column: Tickets List */}
              <div className="overflow-y-auto max-h-[560px] divide-y divide-border">
                {filteredTickets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No support tickets found matching this filter.
                  </div>
                ) : (
                  filteredTickets.map((t) => {
                    const isSelected = selectedTicket?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className={`p-3.5 cursor-pointer transition-colors text-xs space-y-1.5 ${
                          isSelected ? "bg-accent/30 border-l-2 border-primary" : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-foreground truncate">{t.subject}</span>
                          <Badge
                            className={`text-[10px] uppercase font-mono ${
                              t.status === "open"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : t.status === "in_progress"
                                ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {t.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          <Link
                            href={`/admin/tenant/${t.orgId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-foreground hover:underline hover:text-primary"
                          >
                            {t.orgName}
                          </Link>{" "}
                          · {t.userEmail}
                        </div>
                        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {t.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize ${
                              t.priority === "urgent" || t.priority === "high" ? "text-destructive border-destructive/30" : ""
                            }`}
                          >
                            {t.priority}
                          </Badge>
                          {(() => {
                            const deadline = t.slaDeadline ? new Date(t.slaDeadline).getTime() : 0;
                            if (!deadline || t.status === "resolved") return null;
                            const diffHours = Math.round((deadline - Date.now()) / (1000 * 60 * 60));
                            const isBreached = diffHours <= 0;
                            return (
                              <Badge
                                variant="outline"
                                className={`text-[9px] font-mono ${
                                  isBreached
                                    ? "bg-destructive/15 text-destructive border-destructive/30 animate-pulse font-bold"
                                    : diffHours <= 4
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <Clock className="h-2.5 w-2.5 mr-1 inline" />
                                {isBreached ? "Response deadline missed" : `${diffHours}h SLA`}
                              </Badge>
                            );
                          })()}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(t.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Ticket Conversation Thread & Internal Notes */}
              <div className="md:col-span-2 flex flex-col justify-between p-4">
                {selectedTicket ? (
                  <>
                    <div className="border-b pb-3 mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">{selectedTicket.subject}</h4>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <Link
                            href={`/admin/tenant/${selectedTicket.orgId}`}
                            className="font-medium text-foreground hover:underline hover:text-primary"
                          >
                            {selectedTicket.orgName}
                          </Link>
                          <span>· Submitted by {selectedTicket.userEmail}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/tenant/${selectedTicket.orgId}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1"
                          >
                            <Eye className="h-3 w-3" /> Tenant 360
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                          disabled={busy === selectedTicket.orgId}
                          onClick={() => impersonate(selectedTicket.orgId, "/leads", true)}
                          title="Inspect tenant dashboard safely in read-only mode"
                        >
                          View Tenant (Read-Only)
                        </Button>
                        {/* Assignment dropdown */}
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          <Select
                            value={selectedTicket.assignedTo ?? "unassigned"}
                            onValueChange={(val) => handleAssignTicket(selectedTicket.id, val === "unassigned" ? null : val)}
                          >
                            <SelectTrigger className="h-7 text-[11px] w-32">
                              <SelectValue placeholder="Assignee" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              <SelectItem value="Support Tier 1">Support Tier 1</SelectItem>
                              <SelectItem value="Engineering On-Call">Engineering On-Call</SelectItem>
                              <SelectItem value="Revenue & Billing Staff">Revenue & Billing Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Status dropdown */}
                        <Select
                          value={selectedTicket.status}
                          onValueChange={(val: any) => handleUpdateTicketStatus(selectedTicket.id, val)}
                        >
                          <SelectTrigger className="h-7 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Tab switch between Customer Messages and Internal Staff Notes */}
                    <div className="flex items-center gap-2 border-b mb-3 pb-1">
                      <Button
                        variant={ticketActiveTab === "messages" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setTicketActiveTab("messages")}
                      >
                        Messages ({selectedTicket.messages.length})
                      </Button>
                      <Button
                        variant={ticketActiveTab === "notes" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs gap-1.5 text-amber-800 dark:text-amber-200"
                        onClick={() => setTicketActiveTab("notes")}
                      >
                        <StickyNote className="h-3 w-3 text-amber-500" />
                        Internal Notes ({selectedTicket.internalNotes?.length ?? 0})
                      </Button>
                    </div>

                    {/* Messages or Internal Notes Scroll Area */}
                    {ticketActiveTab === "messages" ? (
                      <>
                        <div className="flex-1 overflow-y-auto space-y-3 max-h-[300px] pr-2">
                          {selectedTicket.messages.map((m) => {
                            const isSuper = m.sender === "superadmin";
                            return (
                              <div
                                key={m.id}
                                className={`flex flex-col ${isSuper ? "items-end" : "items-start"}`}
                              >
                                <div className="text-[10px] text-muted-foreground mb-1">
                                  {m.senderName} ({isSuper ? "SuperAdmin" : "Tenant"}) · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div
                                  className={`rounded-xl px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap ${
                                    isSuper
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-foreground"
                                  }`}
                                >
                                  {m.body}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Reply Input */}
                        <div className="pt-3 border-t mt-3 space-y-2">
                          <Input
                            placeholder="Write a response to the tenant admin..."
                            value={ticketReplyText}
                            onChange={(e) => setTicketReplyText(e.target.value)}
                            className="text-xs h-9"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendTicketReply();
                              }
                            }}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              disabled={replySending || !ticketReplyText.trim()}
                              onClick={handleSendTicketReply}
                            >
                              {replySending ? "Sending..." : "Send Reply & Alert"}
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] pr-2">
                          {(!selectedTicket.internalNotes || selectedTicket.internalNotes.length === 0) ? (
                            <div className="py-8 text-center text-xs text-muted-foreground">
                              No internal triage notes recorded for this ticket yet.
                            </div>
                          ) : (
                            selectedTicket.internalNotes.map((note) => (
                              <div key={note.id} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-amber-800 dark:text-amber-200">
                                  <span className="font-semibold">{note.authorName}</span>
                                  <span>{new Date(note.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-foreground whitespace-pre-wrap">{note.body}</p>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Note Input */}
                        <div className="pt-3 border-t mt-3 space-y-2">
                          <Input
                            placeholder="Add a private staff triage note (hidden from customer)..."
                            value={ticketNoteText}
                            onChange={(e) => setTicketNoteText(e.target.value)}
                            className="text-xs h-9"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAddTicketNote();
                              }
                            }}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs gap-1.5"
                              disabled={!ticketNoteText.trim()}
                              onClick={handleAddTicketNote}
                            >
                              Add Private Note
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground text-xs">
                    <LifeBuoy className="h-8 w-8 mb-2 stroke-1 opacity-50" />
                    Select a ticket from the left queue to review history and respond.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Feature Flags & Progressive Rollouts */}
      {tab === "flags" && (
        <div className="space-y-6">
          {/* Feature Flags Card */}
          <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
            <div className="border-b pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> Feature Flags &amp; Progressive Delivery
              </h3>
              <p className="text-xs text-muted-foreground">
                Zero-downtime release switches for AI copilot, WhatsApp BSP API, and predictive analytics across tenants.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {flags.map((flag) => (
                <div
                  key={flag.key}
                  className="rounded-xl border p-4 bg-muted/15 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-foreground">{flag.name}</div>
                      <Badge
                        variant={flag.enabled ? "default" : "outline"}
                        className={flag.enabled ? "bg-emerald-600 text-white" : "text-muted-foreground"}
                      >
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <span className="font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {flag.key}
                      </span>
                      {flag.plans && flag.plans.length > 0 ? (
                        <span className="text-muted-foreground">
                          Plans: {flag.plans.map((p) => p.toUpperCase()).join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">All Plans</span>
                      )}
                    </div>

                    {/* Per-Tenant Overrides Management */}
                    <div className="pt-2 border-t mt-2">
                      <div className="text-[11px] font-semibold text-foreground flex items-center justify-between mb-1">
                        <span>Tenant Overrides ({flag.allowedOrgIds?.length ?? 0})</span>
                        <span className="text-[10px] text-muted-foreground font-normal">Bypasses plan gates &amp; global toggle</span>
                      </div>
                      
                      {flag.allowedOrgIds && flag.allowedOrgIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {flag.allowedOrgIds.map((orgId) => {
                            const o = orgs.find((org) => org.id === orgId);
                            return (
                              <span
                                key={orgId}
                                className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 text-[10px] font-mono"
                              >
                                {o ? o.name : orgId.slice(0, 8)}
                                <button
                                  type="button"
                                  onClick={() => handleToggleTenantFlag(flag.key, orgId, false)}
                                  className="hover:text-destructive transition-colors ml-0.5 font-bold"
                                  title="Revoke override"
                                >
                                  &times;
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <select
                        className="h-7 text-[11px] rounded border bg-background px-2 w-full text-muted-foreground"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleToggleTenantFlag(flag.key, e.target.value, true);
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">+ Grant tenant override bypass...</option>
                        {orgs
                          .filter((o) => !(flag.allowedOrgIds ?? []).includes(o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({o.slug})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant={flag.enabled ? "outline" : "default"}
                      className="h-8 text-xs"
                      onClick={() => handleToggleFlag(flag.key, flag.enabled)}
                    >
                      {flag.enabled ? "Turn Off Feature" : "Enable Feature"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Maintenance Mode & Emergency Lockdown Card */}
          <div className="rounded-2xl border border-destructive/30 bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Power className="h-5 w-5 text-destructive" />
                <div>
                  <h3 className="text-sm font-semibold">Global Maintenance Mode &amp; Killswitch</h3>
                  <p className="text-xs text-muted-foreground">
                    Puts the platform into scheduled maintenance state or displays broadcast lockdown banners.
                  </p>
                </div>
              </div>
              <Badge
                variant={maintenance.enabled ? "destructive" : "outline"}
                className="text-xs"
              >
                {maintenance.enabled ? "MAINTENANCE ACTIVE" : "Normal Operations"}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Maintenance Notice to Users</label>
                <Input
                  placeholder="System is undergoing scheduled maintenance. Please check back shortly."
                  value={maintenance.message}
                  onChange={(e) => setMaintenance((prev) => ({ ...prev, message: e.target.value }))}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-muted-foreground">
                  Status:{" "}
                  <span className="font-medium text-foreground">
                    {maintenance.enabled ? "Users see maintenance banner" : "Platform fully accessible"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={maintenance.enabled ? "outline" : "destructive"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      setMaintenance((prev) => ({ ...prev, enabled: !prev.enabled }))
                    }
                  >
                    {maintenance.enabled ? "Deactivate Mode" : "Activate Maintenance Mode"}
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={maintenanceSaving}
                    onClick={handleSaveMaintenance}
                  >
                    {maintenanceSaving ? "Saving..." : "Save Status"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Grant Dialog */}
      <Dialog open={!!creditModalOrg} onOpenChange={(open) => !open && setCreditModalOrg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Usage Credits</DialogTitle>
            <DialogDescription>
              Add AI Copilot or WhatsApp messaging quota directly to <strong>{creditModalOrg?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-xs flex justify-between">
              <div>
                <div className="text-muted-foreground">Current AI Balance</div>
                <div className="font-bold text-base mt-0.5">{creditModalOrg?.aiCredits ?? 0} pts</div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground">Current WhatsApp Balance</div>
                <div className="font-bold text-base mt-0.5">{creditModalOrg?.whatsappCredits ?? 0} pts</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">AI Copilot Credits to Add</label>
              <Input
                type="number"
                min="0"
                step="50"
                value={aiGrantAmount}
                onChange={(e) => setAiGrantAmount(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">WhatsApp API Credits to Add</label>
              <Input
                type="number"
                min="0"
                step="50"
                value={whatsappGrantAmount}
                onChange={(e) => setWhatsappGrantAmount(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreditModalOrg(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={grantingCredits} onClick={handleGrantCredits}>
              {grantingCredits ? "Granting..." : "Confirm & Grant Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Generation Dialog */}
      <Dialog open={invoiceModalOpen} onOpenChange={(open) => !open && setInvoiceModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue GST Tax Invoice</DialogTitle>
            <DialogDescription>
              Generate a compliant B2B tax invoice with sequential numbering and GST breakdown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Target Organization</label>
              <Select value={invoiceOrgId} onValueChange={setInvoiceOrgId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.plan.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Plan Tier</label>
                <Select value={invoicePlan} onValueChange={setInvoicePlan}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Base Amount ($ / ₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">B2B GSTIN (Optional)</label>
              <Input
                placeholder="29ABCDE1234F1Z5"
                value={invoiceGstin}
                onChange={(e) => setInvoiceGstin(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInvoiceModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={invoiceGenerating || !invoiceOrgId} onClick={handleGenerateInvoice}>
              {invoiceGenerating ? "Generating..." : "Issue & Record Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coupon Creation Dialog */}
      <Dialog open={couponModalOpen} onOpenChange={(open) => !open && setCouponModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Promotional Coupon</DialogTitle>
            <DialogDescription>
              Issue a self-serve discount code for new signups or plan upgrades.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Promo Code</label>
              <Input
                placeholder="LAUNCH50"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="h-9 text-xs font-mono uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Discount Type</label>
                <Select value={couponType} onValueChange={(val) => setCouponType(val as "percent" | "fixed")}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Discount Value</label>
                <Input
                  type="number"
                  min="1"
                  value={couponValue}
                  onChange={(e) => setCouponValue(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Max Redemptions</label>
              <Input
                type="number"
                min="0"
                value={couponMax}
                onChange={(e) => setCouponMax(e.target.value)}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">0 for unlimited uses.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCouponModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={couponSaving || !couponCode.trim()} onClick={handleCreateCoupon}>
              {couponSaving ? "Creating..." : "Save & Activate Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tenant Audit Trail Dialog */}
      <Dialog open={!!auditModalOrg} onOpenChange={(open) => !open && setAuditModalOrg(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Audit Trail — {auditModalOrg?.name}
            </DialogTitle>
            <DialogDescription>
              Administrative and security events recorded for organization ID {auditModalOrg?.id}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {auditLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                Querying tenant audit logs...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No audit events recorded for this organization yet.
              </div>
            ) : (
              <div className="divide-y divide-border border rounded-lg overflow-hidden text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 flex items-start justify-between gap-3 bg-card hover:bg-muted/30 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {log.action}
                        </Badge>
                        {log.entityType && (
                          <span className="font-semibold text-foreground">{log.entityType}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Actor: <span className="font-medium text-foreground">{log.actorName || log.actorEmail || "System"}</span>
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAuditModalOrg(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map Custom Domain Modal */}
      <Dialog open={domainModalOpen} onOpenChange={(open) => !open && setDomainModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Map White-Label Custom Domain
            </DialogTitle>
            <DialogDescription>
              Map a custom Fully Qualified Domain Name (FQDN) to an organization and provision automated SSL routing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="text-xs font-medium text-foreground">Target Organization</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
                value={domainOrgId}
                onChange={(e) => setDomainOrgId(e.target.value)}
              >
                <option value="">-- Select Organization --</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Custom FQDN (Hostname)</label>
              <Input
                placeholder="crm.tenantbrand.com"
                value={domainNameInput}
                onChange={(e) => setDomainNameInput(e.target.value)}
                className="mt-1 text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tenant must point a DNS CNAME record to <code className="bg-muted px-1 rounded font-mono">cname.ridhzo.com</code>.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDomainModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={domainBusy || !domainOrgId || !domainNameInput.trim()}
              onClick={handleRegisterDomain}
            >
              {domainBusy ? "Registering..." : "Register & Provision SSL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Whole-Tenant Hard Delete Confirmation Dialog */}
      {(() => {
        const targetOrg = initial.find((o) => o.id === offboardOrgId);
        const slugMatch = targetOrg
          ? hardDeleteConfirmInput.trim().toLowerCase() === targetOrg.slug.toLowerCase() ||
            hardDeleteConfirmInput.trim().toLowerCase() === targetOrg.name.toLowerCase()
          : false;

        return (
          <Dialog open={hardDeleteModalOpen} onOpenChange={setHardDeleteModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Permanently Hard-Delete {targetOrg?.name ?? "Tenant"}?
                </DialogTitle>
                <DialogDescription>
                  This action is irreversible under DPDP 2023 and GDPR Article 17. All data will be permanently wiped across the database.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 text-xs">
                <div className="p-2.5 rounded border border-destructive/30 bg-destructive/5 text-destructive space-y-1.5">
                  <p className="font-semibold">
                    To confirm, type the tenant slug <code className="bg-destructive/10 px-1 py-0.5 rounded font-mono">{targetOrg?.slug}</code> below:
                  </p>
                  <Input
                    value={hardDeleteConfirmInput}
                    onChange={(e) => setHardDeleteConfirmInput(e.target.value)}
                    placeholder={targetOrg?.slug}
                    className="h-8 text-xs font-mono border-destructive/40 focus-visible:ring-destructive"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setHardDeleteModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={hardDeletingTenant || !slugMatch}
                  onClick={handleHardDeleteTenant}
                  className="gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {hardDeletingTenant ? "Purging Tenant..." : "Permanently Erase Tenant"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
