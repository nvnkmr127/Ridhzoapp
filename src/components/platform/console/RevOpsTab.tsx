"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye,
  LogIn,
  Radio,
  Activity,
  Search,
  Megaphone,
  RefreshCw,
  TrendingUp,
  Zap,
  Power,
  HeartPulse,
  CreditCard,
  Plus,
  Lock,
  Mail,
  Receipt,
  Percent,
  Send,
  Inbox,
  Target,
  ExternalLink,
} from "lucide-react";
import type { MetaCapiConfig, CapiEventLog } from "@/domains/platform/capiService";
type PublicCapiConfig = Omit<MetaCapiConfig, "accessToken"> & { accessToken: string; hasAccessToken: boolean };
import { saveCapiConfigAction, sendCapiTestEventAction, listCapiLogsAction } from "@/lib/actions/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  grantTenantCreditsAction,
  listBillingLifecycleAction,
  extendGracePeriodAction,
  markTenantManuallyPaidAction,
  sendDunningNoticeAction,
  generateInvoiceAction,
  voidInvoiceAction,
  issueCreditNoteAction,
  createCouponAction,
  toggleCouponAction,
  deleteCouponAction,
  saveExecutiveDigestConfigAction,
  sendTestExecutiveDigestAction,
  triggerExecutiveDigestAction,
} from "@/lib/actions/platform";
import type { OrgSummary } from "@/domains/platform/service";
import type { TenantHealthSummary } from "@/domains/platform/revops";
import type { TenantBillingInfo } from "@/domains/billing/lifecycleService";
import type { TaxInvoice } from "@/domains/billing/invoiceService";
import type { Coupon } from "@/domains/billing/couponService";
import type { ExecutiveDigestConfig } from "@/domains/platform/executiveDigestService";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";
import { useImpersonate } from "./useImpersonate";

export function RevOpsTab({ initial = [], revops, tenantHealth = [], initialBilling = [], initialInvoices = [], initialCoupons = [], initialDigestConfig, initialCapiConfig, initialCapiLogs = [], initialCampaigns }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const { toast } = useToast();
  const [orgs] = React.useState<OrgSummary[]>(initial ?? []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const SECTIONS = [
    { key: "overview", label: "Overview" },
    { key: "billing", label: "Billing & invoices" },
    { key: "health", label: "Tenant activity" },
    { key: "growth", label: "Growth & ads" },
  ] as const;
  const [section, setSection] = React.useState<(typeof SECTIONS)[number]["key"]>("overview");
  const show = (k: string) => section === k;
  const [fleetLimit, setFleetLimit] = React.useState(100);
  const [healthLimit, setHealthLimit] = React.useState(100);
  const [capiConfig, setCapiConfig] = React.useState<PublicCapiConfig>(
    initialCapiConfig ?? { pixelId: "", accessToken: "", testEventCode: "", enabled: false, hasAccessToken: false }
  );
  const [capiLogs, setCapiLogs] = React.useState<CapiEventLog[]>(initialCapiLogs ?? []);
  // What is actually saved (the toggle above edits a draft until "Save Settings").
  const [capiLive, setCapiLive] = React.useState(
    !!(initialCapiConfig?.enabled && initialCapiConfig?.pixelId && initialCapiConfig?.hasAccessToken)
  );
  const [testingCapi, setTestingCapi] = React.useState(false);

  const refreshCapiLogs = async () => {
    const res = await listCapiLogsAction(25);
    if (res.ok) setCapiLogs(res.data);
    else toast({ title: "Couldn't refresh events", description: res.message, variant: "destructive" });
  };

  const handleCapiTest = async () => {
    setTestingCapi(true);
    try {
      const res = await sendCapiTestEventAction();
      toast(res.ok ? { title: "Test event sent", description: res.data.message } : { title: "Test event failed", description: res.message, variant: "destructive" });
      await refreshCapiLogs();
    } finally {
      setTestingCapi(false);
    }
  };
  const [campaignStats] = React.useState(initialCampaigns);
  const [savingCapi, setSavingCapi] = React.useState(false);

  const handleSaveCapi = async () => {
    setSavingCapi(true);
    try {
      const res = await saveCapiConfigAction(capiConfig);
      if (res.ok) {
        const live = !!(res.data.enabled && res.data.pixelId && res.data.hasAccessToken);
        toast({ title: "Meta Conversions Settings Saved", description: live ? "Active." : res.data.enabled ? "Saved, but a Pixel ID and access token are both needed before events are sent." : "Disabled." });
        setCapiConfig(res.data);
        setCapiLive(live);
      } else {
        toast({ title: "Save failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setSavingCapi(false);
    }
  };

  // The server page loads data per tab and remounts this component (key={tab}) when ?tab= changes,
  // so the tab comes from the server; switching just navigates.
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

  const billingName = (orgId: string) => billingList.find((b) => b.orgId === orgId)?.orgName ?? "this workspace";

  const [refreshingFleet, setRefreshingFleet] = React.useState(false);
  const handleRefreshFleet = async () => {
    setRefreshingFleet(true);
    try {
      await refreshBillingFleet();
    } catch {
      toast({ title: "Couldn't refresh", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setRefreshingFleet(false);
    }
  };

  // One "why" dialog for the actions that change a tenant's access or books (all are audited with the reason).
  type ReasonKind = "grace" | "paid" | "credit";
  const [reasonDlg, setReasonDlg] = React.useState<{ kind: ReasonKind; id: string } | null>(null);
  const [reasonText, setReasonText] = React.useState("");
  const [reasonBusy, setReasonBusy] = React.useState(false);
  const [offlineAmount, setOfflineAmount] = React.useState("");
  const openReason = (kind: ReasonKind, id: string) => {
    setReasonText(kind === "credit" ? "Double charge refund" : "");
    setOfflineAmount("");
    setReasonDlg({ kind, id });
  };

  const submitReason = async () => {
    if (!reasonDlg) return;
    const reason = reasonText.trim();
    if (reason.length < 3) {
      toast({ title: "Add a reason", description: "3+ characters — it's saved to the audit log.", variant: "destructive" });
      return;
    }
    setReasonBusy(true);
    try {
      if (reasonDlg.kind === "grace") {
        const res = await extendGracePeriodAction(reasonDlg.id, 7, reason);
        if (!res.ok) return void toast({ title: "Failed to extend grace", description: res.message, variant: "destructive" });
        toast({ title: "Grace Period Extended", description: "+7 days added." });
        await refreshBillingFleet();
      } else if (reasonDlg.kind === "paid") {
        const res = await markTenantManuallyPaidAction(reasonDlg.id, 30, reason, Number(offlineAmount) > 0 ? Number(offlineAmount) : undefined);
        if (!res.ok) return void toast({ title: "Failed to update payment", description: res.message, variant: "destructive" });
        toast({ title: "Offline payment recorded", description: res.data.invoiceNumber ? `Full access for 30 days. Invoice ${res.data.invoiceNumber} issued.` : "Full access for 30 days. No invoice was issued." });
        await refreshBillingFleet();
      } else {
        const res = await issueCreditNoteAction(reasonDlg.id, reason);
        if (!res.ok) return void toast({ title: "Failed to issue credit note", description: res.message, variant: "destructive" });
        toast({ title: "Credit Note Issued", description: `${res.data.invoiceNumber} for ₹${Math.abs(res.data.totalAmount)}. No money is moved — refund it in Razorpay or your bank.` });
        setInvoices((prev) => [res.data, ...prev.map((i) => (i.id === reasonDlg.id ? { ...i, status: "refunded" as const } : i))]);
      }
      setReasonDlg(null);
    } finally {
      setReasonBusy(false);
    }
  };

  const handleSendDunning = async (orgId: string) => {
    if (!(await confirm({ title: "Send payment reminder?", description: `Emails ${billingName(orgId)}'s admins now.`, confirmLabel: "Send reminder" }))) return;
    setBillingBusyId(`dunning-${orgId}`);
    try {
      const res = await sendDunningNoticeAction(orgId);
      if (res.ok) {
        toast({ title: "Payment Reminder Sent", description: `Emailed ${res.data.sent} admin(s).` });
        await refreshBillingFleet();
      } else {
        toast({ title: "Reminder not sent", description: res.message, variant: "destructive" });
      }
    } finally {
      setBillingBusyId(null);
    }
  };

  // --- Invoices State ---
  const [invoices, setInvoices] = React.useState<TaxInvoice[]>(initialInvoices ?? []);
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [invoiceOrgId, setInvoiceOrgId] = React.useState("");
  const [invoicePlan, setInvoicePlan] = React.useState<"starter" | "unlimited">("starter");
  const [invoiceAmount, setInvoiceAmount] = React.useState("249");
  const [invoiceGstin, setInvoiceGstin] = React.useState("");
  const [invoiceStatus, setInvoiceStatus] = React.useState<"paid" | "issued">("paid");
  const [invoiceGenerating, setInvoiceGenerating] = React.useState(false);

  const invoiceBase = Number(invoiceAmount) || 0;
  const invoiceGst = Math.round(invoiceBase * 18) / 100;
  const invoiceTotal = invoiceBase + invoiceGst;

  const handleGenerateInvoice = async () => {
    if (!invoiceOrgId) return;
    if (!(await confirm({
      title: `Issue invoice for ${orgs.find((o) => o.id === invoiceOrgId)?.name ?? "this workspace"}?`,
      description: `Total ₹${invoiceTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })} incl. GST. Invoice numbers can't be reused, and the workspace's billing contact is emailed a copy.`,
      confirmLabel: "Issue invoice",
    }))) return;
    setInvoiceGenerating(true);
    try {
      const res = await generateInvoiceAction({
        orgId: invoiceOrgId,
        plan: invoicePlan,
        amount: Number(invoiceAmount) || 0,
        gstin: invoiceGstin || null,
        status: invoiceStatus,
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
    const inv = invoices.find((i) => i.id === id);
    if (!(await confirm({ title: `Void ${inv?.invoiceNumber ?? "this invoice"}?`, description: "Only for an invoice issued in error — a paid one needs a credit note.", confirmLabel: "Void invoice", destructive: true }))) return;
    const res = await voidInvoiceAction(id);
    if (res.ok) {
      toast({ title: "Invoice Voided", description: `Marked invoice as void.` });
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, status: "void" } : inv)));
    } else {
      toast({ title: "Failed to void invoice", description: res.message, variant: "destructive" });
    }
  };

  // --- Coupons State ---
  const [coupons, setCoupons] = React.useState<Coupon[]>(initialCoupons ?? []);
  const [couponModalOpen, setCouponModalOpen] = React.useState(false);
  const [couponCode, setCouponCode] = React.useState("");
  const [couponType, setCouponType] = React.useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = React.useState("25");
  const [couponMax, setCouponMax] = React.useState("100");
  const [couponOfferId, setCouponOfferId] = React.useState("");
  const [couponPlans, setCouponPlans] = React.useState<string[]>(["starter", "unlimited"]);
  const [couponExpiry, setCouponExpiry] = React.useState("");
  const [couponSaving, setCouponSaving] = React.useState(false);

  const handleCreateCoupon = async () => {
    if (!couponCode.trim() || !couponOfferId.trim() || couponPlans.length === 0) return;
    setCouponSaving(true);
    try {
      const res = await createCouponAction({
        code: couponCode,
        discountType: couponType,
        discountValue: Number(couponValue) || 0,
        maxRedemptions: Number(couponMax) || 0,
        razorpayOfferId: couponOfferId.trim() || null,
        plans: couponPlans,
        expiresAt: couponExpiry || "",
      });
      if (res.ok) {
        toast({ title: "Coupon Created", description: `Code ${res.data.code} is now live.` });
        setCoupons((prev) => [res.data, ...prev]);
        setCouponModalOpen(false);
        setCouponCode("");
        setCouponOfferId("");
        setCouponExpiry("");
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
    } else {
      toast({ title: "Couldn't update coupon", description: res.message, variant: "destructive" });
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    const code = coupons.find((c) => c.id === id)?.code ?? "this coupon";
    if (!(await confirm({ title: `Delete coupon ${code}?`, description: "Customers can no longer redeem it. Deactivate it instead to keep its history.", confirmLabel: "Delete", destructive: true }))) return;
    const res = await deleteCouponAction(id);
    if (res.ok) {
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Coupon Deleted" });
    } else {
      toast({ title: "Couldn't delete coupon", description: res.message, variant: "destructive" });
    }
  };

  // --- Executive digest state ---
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
    if (!(await confirm({ title: "Send the executive digest now?", description: "Emails it to every configured recipient.", confirmLabel: "Send digest" }))) return;
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

  // --- Credit grant state ---
  const [creditModalOrg, setCreditModalOrg] = React.useState<TenantHealthSummary | null>(null);
  const [aiGrantAmount, setAiGrantAmount] = React.useState("500");
  const [grantingCredits, setGrantingCredits] = React.useState(false);

  const impersonate = useImpersonate(setBusy, confirm);

  async function handleGrantCredits() {
    if (!creditModalOrg) return;
    const ai = parseInt(aiGrantAmount, 10);
    if (isNaN(ai) || ai <= 0) {
      toast({ variant: "destructive", title: "Enter a positive number of credits." });
      return;
    }
    setGrantingCredits(true);
    const res = await grantTenantCreditsAction(creditModalOrg.id, ai);
    setGrantingCredits(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to grant credits", description: res.message });
    } else {
      toast({
        title: "Credits granted",
        description: `${res.data.max - res.data.used} AI credits left this month (of ${res.data.max}).`,
      });
      setHealthList((prev) =>
        prev.map((t) =>
          t.id === creditModalOrg.id ? { ...t, aiCreditsLeft: res.data.max - res.data.used, aiCreditsMax: res.data.max } : t
        )
      );
      setCreditModalOrg(null);
    }
  }

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
    <>
      {confirmDialog}
      <div className="space-y-6">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {SECTIONS.map((sec) => (
            <Button
              key={sec.key}
              role="tab"
              aria-selected={section === sec.key}
              variant={section === sec.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSection(sec.key)}
            >
              {sec.label}
            </Button>
          ))}
        </div>
        {show("overview") && (<>
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
            <p className="mt-1 text-xs text-muted-foreground">
              {revops?.freeAccounts ?? 0} not paying (free, trials, clients)
              {(revops?.complimentaryAccounts ?? 0) > 0 && ` · ${revops?.complimentaryAccounts} on a free plan for clients`}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Paying Accounts At Risk
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {revops?.churnRiskCount ?? 0}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Paying workspaces with no lead activity for 7+ days</p>
          </div>
        </div>

        </>)}
        {show("overview") && (<>
        {/* Revenue at a glance — only figures we can actually compute (list-price MRR; no invented upgrade/churn flows) */}
        {revops && (
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <div className="border-b pb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Monthly revenue
              </h3>
              <p className="text-xs text-muted-foreground">
                Figures use list price for paying workspaces. Trials and complimentary plans are excluded; coupons aren&apos;t deducted.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase">From new workspaces</div>
                <div className="text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">₹{revops.newAccountsMrr.toLocaleString()}</div>
                <p className="text-[10px] text-muted-foreground">Signed up in the last 30 days</p>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <div className="text-[11px] font-medium text-destructive uppercase">At risk</div>
                <div className="text-lg font-bold mt-1 text-destructive">₹{revops.churnRiskMrr.toLocaleString()}</div>
                <p className="text-[10px] text-muted-foreground">{revops.churnRiskCount} paying workspaces inactive 7+ days</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-[11px] font-medium text-muted-foreground uppercase">Complimentary</div>
                <div className="text-lg font-bold mt-1 text-foreground">{revops.complimentaryAccounts}</div>
                <p className="text-[10px] text-muted-foreground">Paid plans given free</p>
              </div>
            </div>
          </div>
        )}

        </>)}
        {show("overview") && (<>
        {/* Signup -> Activation -> Paid Funnel Card */}
        {revops?.funnel && (
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-3 gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Signup → Activation → Paid Funnel
                </h3>
                <p className="text-xs text-muted-foreground">
                  Workspaces that signed up in the last 30 days. Many are still in their free trial, so the paid rate keeps rising as trials end.
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

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
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

        </>)}
        {show("billing") && (<>
        {/* Subscription Payment & Dunning Fleet Inspector Card */}
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="p-5 border-b space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> Payments &amp; Overdue Accounts
                </h3>
                <p className="text-xs text-muted-foreground">
                  Every workspace's payment status. Overdue accounts get a 7-day grace period, then features lock until they pay.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={refreshingFleet}
                  onClick={handleRefreshFleet}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingFleet ? "animate-spin" : ""}`} /> Refresh
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
                {(["all", "paid", "trial", "grace_period", "locked", "pending", "complimentary", "free"] as const).map((statusVal) => {
                  const count =
                    statusVal === "all"
                      ? billingList.length
                      : billingList.filter((b) => b.status === statusVal).length;
                  const labels: Record<string, string> = {
                    all: "All Accounts",
                    paid: "Paid",
                    trial: "Trial",
                    complimentary: "Free for client",
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
                  <th className="p-3">Payment problem</th>
                  <th className="p-3">Next Renewal / Expiry</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
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
                  filteredBilling.slice(0, fleetLimit).map((b) => {
                    const isGrace = b.status === "grace_period";
                    const isLocked = b.status === "locked";
                    const isPaid = b.status === "paid";
                    const isPending = b.status === "pending";
                    const overdue = isGrace || isLocked;
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
                          {b.status === "trial" && (
                            <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30">
                              Trial{b.trialEndsAt ? ` · ends ${new Date(b.trialEndsAt).toLocaleDateString()}` : ""}
                            </Badge>
                          )}
                          {b.status === "complimentary" && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Free for client
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
                            {overdue && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                                    onClick={() => openReason("grace", b.orgId)}
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
                                  title="Email the workspace admins a payment reminder"
                                >
                                  <Mail className="h-3 w-3" /> Send reminder
                                </Button>
                              </>
                            )}
                            {overdue && (                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                                            onClick={() => openReason("paid", b.orgId)}
                              title="Payment received outside Razorpay: restores full access for 30 days"
                            >
                              Record offline payment
                            </Button>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            {filteredBilling.length > fleetLimit && (
              <tfoot>
                <tr>
                  <td colSpan={9} className="p-3 text-center">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFleetLimit((n) => n + 100)}>
                      Show more ({filteredBilling.length - fleetLimit} hidden)
                    </Button>
                  </td>
                </tr>
              </tfoot>
            )}
            </table>
          </div>
        </div>

        </>)}
        {show("health") && (<>
        {/* Tenant Cancellation Risk & Health Predictor Card */}
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="p-5 border-b space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-primary" /> Tenant Activity &amp; AI Credits
                </h3>
                <p className="text-xs text-muted-foreground">
                  Based on when each workspace last touched a lead, least active first. Only paying workspaces count towards revenue at risk.
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
                  <th className="p-3">AI credits left</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredHealth.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No organizations found matching the filter.
                    </td>
                  </tr>
                ) : (
                  filteredHealth.slice(0, healthLimit).map((tenant) => (
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
                            Inactive 14d+
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
                          {tenant.aiCreditsLeft.toLocaleString()}
                          <span className="text-muted-foreground font-normal">/ {tenant.aiCreditsMax.toLocaleString()}</span>
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
                              setAiGrantAmount("100");
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
            {filteredHealth.length > healthLimit && (
              <tfoot>
                <tr>
                  <td colSpan={9} className="p-3 text-center">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setHealthLimit((n) => n + 100)}>
                      Show more ({filteredHealth.length - healthLimit} hidden)
                    </Button>
                  </td>
                </tr>
              </tfoot>
            )}
            </table>
          </div>
        </div>

        </>)}
        {show("billing") && (<>
        {/* GST Tax Invoicing & Billing Ledger Card */}
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="p-5 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" /> Tax invoices &amp; credit notes
              </h3>
              <p className="text-xs text-muted-foreground">
                Razorpay payments get an invoice automatically. Use "Issue Tax Invoice" for customers who pay offline. Showing the latest 50.
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
                      No invoices yet.
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
                          <Link href={`/invoice/${inv.id}`} target="_blank" title="Open invoice" className="inline-flex h-6 items-center px-1.5 text-muted-foreground hover:text-primary">
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          {inv.status === "paid" && inv.type !== "credit_note" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-purple-600 hover:bg-purple-500/10"
                              onClick={() => openReason("credit", inv.id)}
                              title="Issue a GST credit note (records the reversal; does not move money)"
                            >
                              Credit Note
                            </Button>
                          )}
                          {inv.status === "issued" && inv.type !== "credit_note" && (
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

        </>)}
        {show("billing") && (<>
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

        </>)}
        {show("overview") && (<>
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
                  Emails a revenue and health summary on the schedule below (checked hourly). Save the schedule after changing it.
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

        </>)}
        {show("growth") && (<>
        {/* Growth Campaigns & Attribution Performance */}
        <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Growth Campaigns &amp; Conversion Attribution
              </h3>
              <p className="text-xs text-muted-foreground">
                Each workspace is credited to the campaign it first arrived from (UTM parameters and ad click IDs), across all signups to date.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-xs w-fit">
              {campaignStats?.campaigns?.length ?? 0} campaign groups
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
                    capiLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                <span className="text-sm">
                  {capiLive ? "Live" : capiConfig.enabled ? "Needs setup" : "Paused"}
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

        </>)}
        {show("growth") && (<>
        {/* Meta Conversions API (Conversions) & Server-Side Ad Engine */}
        <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" /> Meta Conversions API
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
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={testingCapi || !capiLive} onClick={handleCapiTest} title={capiLive ? "Sends a test Lead event using your email" : "Save a Pixel ID and token, and enable, first"}>
                {testingCapi ? "Sending..." : "Send test event"}
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
                placeholder={capiConfig.hasAccessToken ? "•••••••• saved — leave blank to keep" : "EAAG..."}
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
              <button type="button" onClick={refreshCapiLogs} className="text-[10px] text-muted-foreground font-normal hover:text-primary inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Refresh · last {capiLogs.length} events
              </button>
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
                        No Conversions events dispatched yet. Use &quot;Send test event&quot; above to check the connection.
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
        </>)}
      </div>

      {/* Reason dialog: grace / offline payment / credit note */}
      <Dialog open={!!reasonDlg} onOpenChange={(open) => !open && !reasonBusy && setReasonDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonDlg?.kind === "grace" && `Give ${billingName(reasonDlg.id)} 7 more days?`}
              {reasonDlg?.kind === "paid" && `Record an offline payment for ${billingName(reasonDlg.id)}?`}
              {reasonDlg?.kind === "credit" && `Issue a credit note for ${invoices.find((i) => i.id === reasonDlg.id)?.invoiceNumber ?? "this invoice"}?`}
            </DialogTitle>
            <DialogDescription>
              {reasonDlg?.kind === "grace" && "They keep full access for 7 more days and are notified."}
              {reasonDlg?.kind === "paid" && "Full access for 30 days without a Razorpay charge. Enter the amount to also issue the tax invoice."}
              {reasonDlg?.kind === "credit" && "Reverses the invoice for GST. It doesn't refund any money — do that in Razorpay or your bank."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="reason" className="text-xs font-medium text-foreground">Reason (saved to the audit log)</label>
            <Input id="reason" value={reasonText} onChange={(e) => setReasonText(e.target.value)} maxLength={500} className="h-9 text-xs" autoFocus />
          </div>
          {reasonDlg?.kind === "paid" && (
            <div className="space-y-2 pb-2">
              <label htmlFor="offline-amt" className="text-xs font-medium text-foreground">Amount received before GST, ₹ (optional — issues a paid tax invoice)</label>
              <Input id="offline-amt" type="number" min="0" value={offlineAmount} onChange={(e) => setOfflineAmount(e.target.value)} className="h-9 text-xs font-mono" placeholder="Leave blank for no invoice" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReasonDlg(null)} disabled={reasonBusy}>Cancel</Button>
            <Button size="sm" onClick={submitReason} disabled={reasonBusy || reasonText.trim().length < 3}>
              {reasonBusy ? "Working..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Grant Dialog */}
      <Dialog open={!!creditModalOrg} onOpenChange={(open) => !open && setCreditModalOrg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant bonus AI credits</DialogTitle>
            <DialogDescription>
              Extra AI credits for <strong>{creditModalOrg?.name}</strong> for the rest of this month. They reset with the monthly allowance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-xs">
              <div className="text-muted-foreground">Left this month</div>
              <div className="font-bold text-base mt-0.5">{creditModalOrg?.aiCreditsLeft ?? 0} of {creditModalOrg?.aiCreditsMax ?? 0}</div>
            </div>

            <div className="space-y-2">
              <label htmlFor="ai-grant" className="text-xs font-medium text-foreground">Credits to add</label>
              <Input
                id="ai-grant"
                type="number"
                min="1"
                step="50"
                value={aiGrantAmount}
                onChange={(e) => setAiGrantAmount(e.target.value)}
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
                <Select value={invoicePlan} onValueChange={(v) => setInvoicePlan(v as "starter" | "unlimited")}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Amount before GST (₹)</label>
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
              <label className="text-xs font-medium text-foreground">Payment</label>
              <Select value={invoiceStatus} onValueChange={(v) => setInvoiceStatus(v as "paid" | "issued")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Already paid</SelectItem>
                  <SelectItem value="issued">Not paid yet</SelectItem>
                </SelectContent>
              </Select>
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

          <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-0.5">
            <div className="flex justify-between"><span className="text-muted-foreground">GST 18%</span><span className="font-mono">₹{invoiceGst.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">₹{invoiceTotal.toLocaleString("en-IN")}</span></div>
            <p className="text-[10px] text-muted-foreground pt-1">GST is added on top of the amount. Split into CGST/SGST or IGST is decided from the GSTIN.</p>
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
                    <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
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
              <label className="text-xs font-medium text-foreground">Razorpay Offer ID (required)</label>
              <Input
                value={couponOfferId}
                onChange={(e) => setCouponOfferId(e.target.value)}
                placeholder="offer_XXXXXXXXXXXX"
                className="h-9 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Create the offer (same discount) in Razorpay → Offers, enable it for subscriptions, paste its ID here. Without it customers can't use the code.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Valid for plans</label>
              <div className="flex gap-3 text-xs">
                {["starter", "unlimited"].map((p) => (
                  <label key={p} className="flex items-center gap-1.5 capitalize">
                    <input
                      type="checkbox"
                      checked={couponPlans.includes(p)}
                      onChange={(e) => setCouponPlans((prev) => (e.target.checked ? [...prev, p] : prev.filter((x) => x !== p)))}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Expires on (optional)</label>
              <Input type="date" value={couponExpiry} onChange={(e) => setCouponExpiry(e.target.value)} className="h-9 text-xs" />
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
            <Button size="sm" disabled={couponSaving || !couponCode.trim() || !couponOfferId.trim() || couponPlans.length === 0} onClick={handleCreateCoupon}>
              {couponSaving ? "Creating..." : "Save & Activate Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
