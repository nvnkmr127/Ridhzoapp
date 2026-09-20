"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  CreditCard,
  Zap,
  Radio,
  Users,
  ExternalLink,
  RefreshCw,
  Ban,
  UserCheck,
  Building2,
  Sparkles,
  Activity,
  Mail,
  AlertCircle,
  Download,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import type { Tenant360Data } from "@/domains/platform/service";
import {
  impersonateOrgAction,
  grantTenantCreditsAction,
  extendGracePeriodAction,
  markTenantManuallyPaidAction,
  sendDunningNoticeAction,
  setOrgPlanAction,
  setOrgSuspendedAction,
  revokeOrgSessionsAction,
  updateSupportTicketStatusAction,
  exportTenantDossierAction,
  hardDeleteTenantAction,
  replayAuthFailedLeadsAction,
} from "@/lib/actions/platform";

interface Tenant360ViewProps {
  initialData: Tenant360Data;
}

const PLANS = ["free", "pro", "business"] as const;

export function Tenant360View({ initialData }: Tenant360ViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [data, setData] = React.useState<Tenant360Data>(initialData);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  // Credit Grant Modal
  const [creditModalOpen, setCreditModalOpen] = React.useState(false);
  const [aiGrant, setAiGrant] = React.useState("500");
  const [whatsappGrant, setWhatsappGrant] = React.useState("250");
  const [granting, setGranting] = React.useState(false);

  // Offboarding & GDPR
  const [exportingDossier, setExportingDossier] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [confirmSlug, setConfirmSlug] = React.useState("");
  const [deletingTenant, setDeletingTenant] = React.useState(false);

  // Meta Ingestion Diagnostics & Replay
  const [replayingPageId, setReplayingPageId] = React.useState<string | null>(null);

  const { org, health, billing, invoices, tickets, users, leadsStats, auditLogs, failedDeliveries, apiKeys, anomalies, integrations } = data;

  const isSuspended = !!org.suspendedAt;
  const healthStatus = health?.health ?? "healthy";
  const daysInactive = health?.daysInactive ?? 0;
  const openTickets = tickets.filter((t) => t.status !== "resolved");
  const urgentTickets = openTickets.filter((t) => t.priority === "urgent" || t.priority === "high");

  // Determine Meta Token Health
  const deadMetaSources = (integrations?.sources ?? []).filter(
    (s) => s.tokenStatus === "dead" || s.tokenStatus === "expired" || s.needsReconnect
  );
  const expiringMetaSources = (integrations?.sources ?? []).filter(
    (s) => s.tokenStatus === "expiring_soon"
  );

  // Determine churn diagnosis drivers
  const churnDrivers: string[] = [];
  if (daysInactive >= 7) {
    churnDrivers.push(`No activity in the last ${daysInactive} days (last active: ${health?.lastActiveAt ? new Date(health.lastActiveAt).toLocaleDateString() : "Never"})`);
  }
  if (billing?.status === "grace_period") {
    churnDrivers.push(`Payment failed: ${billing.failureReason ?? "Renewal declined"}. Grace period ends in ${billing.daysRemainingInGrace} days.`);
  } else if (billing?.status === "locked") {
    churnDrivers.push(`Account locked due to overdue payment: ${billing.failureReason ?? "Unpaid subscription"}.`);
  }
  if (urgentTickets.length > 0) {
    churnDrivers.push(`${urgentTickets.length} high-priority support ticket${urgentTickets.length > 1 ? "s" : ""} currently unresolved.`);
  }
  if (failedDeliveries.length > 0) {
    churnDrivers.push(`${failedDeliveries.length} failed webhook event${failedDeliveries.length > 1 ? "s" : ""} in DLQ.`);
  }
  if (anomalies.length > 0) {
    churnDrivers.push(`${anomalies.length} active security anomal${anomalies.length > 1 ? "ies" : "y"} flagged on this tenant.`);
  }

  // Determine double-charge warnings
  const doubleChargeWarnings: string[] = [];
  const paidInvoices = (invoices ?? []).filter((i) => i.status === "paid");
  for (let i = 0; i < paidInvoices.length; i++) {
    for (let j = i + 1; j < paidInvoices.length; j++) {
      const t1 = new Date(paidInvoices[i].issuedAt).getTime();
      const t2 = new Date(paidInvoices[j].issuedAt).getTime();
      const dayDiff = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
      if (dayDiff <= 28) {
        doubleChargeWarnings.push(
          `Overlapping payments within ${Math.round(dayDiff)} days: ${paidInvoices[i].invoiceNumber} (₹${paidInvoices[i].totalAmount}) and ${paidInvoices[j].invoiceNumber} (₹${paidInvoices[j].totalAmount})`
        );
      }
    }
  }

  // Determine leads ingestion stalled warnings
  const leadsStalledWarnings: string[] = [];
  const sourceCount = integrations?.sources?.length ?? 0;
  if (deadMetaSources.length > 0) {
    deadMetaSources.forEach((s) => {
      leadsStalledWarnings.push(
        `🚨 Meta Lead Ads token dead on "${s.name}" (Page ID: ${s.pageId || "N/A"}): OAuth Code 190 / token revoked. ${s.authFailedEventsCount ?? 0} lead event(s) failed.`
      );
    });
  }
  if (daysInactive >= 3 && (leadsStats.total > 0 || sourceCount > 0)) {
    leadsStalledWarnings.push(
      `Inbound leads stopped: 0 leads captured in the last ${daysInactive} days (last active: ${health?.lastActiveAt ? new Date(health.lastActiveAt).toLocaleDateString() : "Never"}).`
    );
  }
  if (sourceCount === 0 && leadsStats.total === 0) {
    leadsStalledWarnings.push("No inbound lead integrations (Meta Lead Ads/Webhook) configured for this tenant.");
  }
  if ((failedDeliveries ?? []).length > 0) {
    leadsStalledWarnings.push(
      `${failedDeliveries.length} failed webhook deliveries in DLQ: downstream webhook destinations rejecting data.`
    );
  }

  // Quick Actions Handlers
  const handleImpersonate = async (readOnly = false, redirectPath = "/leads") => {
    setBusyAction("impersonate");
    try {
      const res = await impersonateOrgAction(org.id, readOnly);
      if (res.ok) {
        toast({
          title: "Session Started",
          description: `Now operating inside ${org.name}${readOnly ? " (read-only)" : ""}.`,
        });
        router.push(redirectPath);
      } else {
        toast({ title: "Failed to impersonate", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleReplayAuthEvents = async (pageId: string) => {
    setReplayingPageId(pageId);
    try {
      const res = await replayAuthFailedLeadsAction(org.id, pageId);
      if (res.ok) {
        toast({
          title: "Leads Requeued for Ingestion",
          description: res.data?.message || `Successfully requeued ${res.data?.replayedCount ?? 0} leads.`,
        });
        setData((prev) => ({
          ...prev,
          integrations: prev.integrations
            ? {
                ...prev.integrations,
                sources: prev.integrations.sources.map((s) =>
                  s.pageId === pageId ? { ...s, authFailedEventsCount: 0 } : s
                ),
                metaTokenDeadCount: Math.max(0, (prev.integrations.metaTokenDeadCount ?? 1) - 1),
              }
            : prev.integrations,
        }));
      } else {
        toast({ title: "Failed to replay leads", description: res.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Replay Error", description: "Failed to requeue lead events.", variant: "destructive" });
    } finally {
      setReplayingPageId(null);
    }
  };

  const handleGrantCredits = async () => {
    const aiVal = parseInt(aiGrant, 10);
    const waVal = parseInt(whatsappGrant, 10);
    if (isNaN(aiVal) || isNaN(waVal)) {
      toast({ title: "Invalid amount", description: "Please enter valid credit amounts.", variant: "destructive" });
      return;
    }

    setGranting(true);
    try {
      const res = await grantTenantCreditsAction(org.id, aiVal, waVal);
      if (res.ok) {
        toast({
          title: "Credits Granted",
          description: `Added ${aiVal} AI & ${waVal} WhatsApp credits to ${org.name}.`,
        });
        if (res.data) {
          setData((prev) => ({
            ...prev,
            health: prev.health
              ? { ...prev.health, aiCredits: res.data!.aiCredits, whatsappCredits: res.data!.whatsappCredits }
              : null,
          }));
        }
        setCreditModalOpen(false);
      } else {
        toast({ title: "Failed to grant credits", description: res.message, variant: "destructive" });
      }
    } finally {
      setGranting(false);
    }
  };

  const handleExtendGrace = async () => {
    setBusyAction("extend-grace");
    try {
      const res = await extendGracePeriodAction(org.id, 7);
      if (res.ok) {
        toast({ title: "Grace Period Extended", description: "+7 days added to tenant grace period." });
        setData((prev) => ({
          ...prev,
          billing: prev.billing
            ? { ...prev.billing, status: "grace_period", daysRemainingInGrace: prev.billing.daysRemainingInGrace + 7 }
            : null,
        }));
      } else {
        toast({ title: "Failed to extend grace", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleMarkPaid = async () => {
    setBusyAction("mark-paid");
    try {
      const res = await markTenantManuallyPaidAction(org.id, 30);
      if (res.ok) {
        toast({ title: "Marked Paid Offline", description: "Access unlocked for 30 days." });
        setData((prev) => ({
          ...prev,
          billing: prev.billing ? { ...prev.billing, status: "paid", daysRemainingInGrace: 0 } : null,
        }));
      } else {
        toast({ title: "Failed to update payment", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendDunning = async () => {
    setBusyAction("dunning");
    try {
      const res = await sendDunningNoticeAction(org.id);
      if (res.ok) {
        toast({ title: "Dunning Notice Sent", description: "Email and in-app notice dispatched to tenant admins." });
      } else {
        toast({ title: "Failed to send notice", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleSuspend = async () => {
    const nextSuspended = !isSuspended;
    if (nextSuspended && !confirm(`Suspend ${org.name}? Its users will immediately be blocked from signing in.`)) {
      return;
    }
    setBusyAction("suspend");
    try {
      const res = await setOrgSuspendedAction(org.id, nextSuspended);
      if (res.ok) {
        toast({
          title: nextSuspended ? "Organization Suspended" : "Organization Reactivated",
          description: nextSuspended ? "Tenant logins are now blocked." : "Tenant access restored.",
        });
        setData((prev) => ({
          ...prev,
          org: { ...prev.org, suspendedAt: nextSuspended ? new Date() : null },
        }));
      } else {
        toast({ title: "Action failed", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleChangePlan = async (plan: "free" | "pro" | "business", trialDays?: number | null) => {
    setBusyAction("plan");
    try {
      const res = await setOrgPlanAction({ organizationId: org.id, plan, trialDays });
      if (res.ok) {
        const trialMsg = trialDays ? ` (14-day trial)` : "";
        toast({ title: "Plan Updated", description: `${org.name} plan changed to ${plan}${trialMsg}.` });
        setData((prev) => ({
          ...prev,
          org: { ...prev.org, plan, trialEndsAt: res.data.trialEndsAt ? new Date(res.data.trialEndsAt) : null } as any,
          health: prev.health ? { ...prev.health, plan } : null,
          billing: prev.billing ? { ...prev.billing, plan, trialEndsAt: res.data.trialEndsAt } : null,
        }));
      } else {
        toast({ title: "Failed to update plan", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeSessions = async () => {
    if (!confirm(`Revoke all active sessions for ${org.name}? Every member will be signed out.`)) return;
    setBusyAction("revoke-sessions");
    try {
      const res = await revokeOrgSessionsAction(org.id);
      if (res.ok) {
        toast({ title: "Sessions Revoked", description: "All active user tokens for this tenant were invalidated." });
      } else {
        toast({ title: "Failed to revoke sessions", description: res.message, variant: "destructive" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportDossier = async () => {
    setExportingDossier(true);
    try {
      const res = await exportTenantDossierAction(org.id);
      if (!res.ok) {
        toast({ title: "Export Failed", description: res.message, variant: "destructive" });
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tenant_dossier_${org.slug}_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast({ title: "Dossier Exported", description: `Exported complete dossier for ${org.name}.` });
    } catch {
      toast({ title: "Export Failed", description: "Could not export tenant dossier.", variant: "destructive" });
    } finally {
      setExportingDossier(false);
    }
  };

  const handleHardDeleteTenant = async () => {
    if (confirmSlug.trim().toLowerCase() !== org.slug.toLowerCase() && confirmSlug.trim().toLowerCase() !== org.name.toLowerCase()) return;
    setDeletingTenant(true);
    try {
      const res = await hardDeleteTenantAction(org.id, confirmSlug.trim());
      if (!res.ok) {
        toast({ title: "Deletion Failed", description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tenant Erased", description: `Permanently deleted ${org.name} and all data.` });
      setDeleteModalOpen(false);
      router.push("/admin");
    } catch {
      toast({ title: "Deletion Failed", description: "Failed to delete tenant.", variant: "destructive" });
    } finally {
      setDeletingTenant(false);
    }
  };

  const handleTicketStatus = async (ticketId: string, status: "open" | "in_progress" | "resolved") => {
    try {
      const res = await updateSupportTicketStatusAction(ticketId, status);
      if (res.ok) {
        toast({ title: "Ticket Updated", description: `Status changed to ${status}.` });
        setData((prev) => ({
          ...prev,
          tickets: prev.tickets.map((t) => (t.id === ticketId ? { ...t, status } : t)),
        }));
      } else {
        toast({ title: "Failed to update ticket", description: res.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not update ticket.", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-7xl mx-auto">
      {/* Back Navigation Bar */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Platform Console
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">Org ID: {org.id}</span>
        </div>
      </div>

      {/* Profile Header Banner */}
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{org.name}</h1>
                <Badge variant="outline" className="font-mono text-xs capitalize">
                  {org.plan}
                </Badge>
                {healthStatus === "healthy" && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Healthy</Badge>
                )}
                {healthStatus === "slowing" && (
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Slowing Activity</Badge>
                )}
                {healthStatus === "at_risk" && (
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">At Risk</Badge>
                )}
                {healthStatus === "critical" && (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20">Critical Churn Risk</Badge>
                )}
                {isSuspended ? (
                  <Badge variant="destructive">Suspended</Badge>
                ) : (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
                )}
                {(org as any).trialEndsAt && new Date((org as any).trialEndsAt).getTime() > Date.now() && (
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-medium">
                    Trial (ends {new Date((org as any).trialEndsAt).toLocaleDateString()})
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="font-mono">slug: {org.slug}</span>
                <span>•</span>
                <span>Created {new Date(org.createdAt).toLocaleDateString()}</span>
                {org.timezone && (
                  <>
                    <span>•</span>
                    <span>TZ: {org.timezone}</span>
                  </>
                )}
                {org.currency && (
                  <>
                    <span>•</span>
                    <span>Currency: {org.currency}</span>
                  </>
                )}
              </div>
            </div>

            {/* Operator Quick Action Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs shadow-sm"
                disabled={busyAction === "impersonate"}
                onClick={() => handleImpersonate(false)}
              >
                <UserCheck className="h-3.5 w-3.5" /> Impersonate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setCreditModalOpen(true)}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Grant Credits
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={exportingDossier}
                onClick={handleExportDossier}
                title="Export complete GDPR/DPDP dossier"
              >
                <Download className="h-3.5 w-3.5" /> {exportingDossier ? "Exporting..." : "Export"}
              </Button>
              <Select
                value={PLANS.includes(org.plan as any) ? org.plan : "free"}
                onValueChange={(val) => {
                  if (val === "pro_trial") {
                    handleChangePlan("pro", 14);
                  } else if (val === "business_trial") {
                    handleChangePlan("business", 14);
                  } else {
                    handleChangePlan(val as any, null);
                  }
                }}
                disabled={busyAction === "plan"}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize text-xs">
                      {p} tier
                    </SelectItem>
                  ))}
                  <SelectItem value="pro_trial" className="text-xs text-amber-600 font-medium">
                    Pro (14d Trial)
                  </SelectItem>
                  <SelectItem value="business_trial" className="text-xs text-amber-600 font-medium">
                    Business (14d Trial)
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={isSuspended ? "default" : "outline"}
                size="sm"
                className={`gap-1.5 text-xs ${isSuspended ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-destructive hover:bg-destructive/10"}`}
                disabled={busyAction === "suspend"}
                onClick={handleToggleSuspend}
              >
                <Ban className="h-3.5 w-3.5" />
                {isSuspended ? "Reactivate" : "Suspend"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Churn Risk Diagnostic Banner: Answers the "WHY" */}
      {(healthStatus === "at_risk" || healthStatus === "critical" || churnDrivers.length > 0) && (
        <Alert
          variant={healthStatus === "critical" ? "destructive" : "default"}
          className={`border ${
            healthStatus === "critical"
              ? "border-destructive/30 bg-destructive/5"
              : "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200"
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span>
              Churn Diagnostic Analysis: {healthStatus === "critical" ? "Critical Churn Risk" : "High Risk Indicators"}
            </span>
            <span className="text-xs font-normal opacity-80">
              {daysInactive > 0 ? `${daysInactive} days inactive` : "Active today"}
            </span>
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs space-y-1.5">
            <p className="font-medium">Identified Risk Drivers:</p>
            <ul className="list-disc pl-5 space-y-1">
              {churnDrivers.length > 0 ? (
                churnDrivers.map((driver, i) => <li key={i}>{driver}</li>)
              ) : (
                <li>Activity volume has slowed below baseline threshold.</li>
              )}
            </ul>
            <div className="pt-2 flex items-center gap-2">
              {billing?.status === "grace_period" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 bg-background"
                  onClick={handleExtendGrace}
                  disabled={busyAction === "extend-grace"}
                >
                  <Clock className="h-3 w-3" /> +7d Grace Period
                </Button>
              )}
              {billing?.status !== "paid" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 bg-background"
                  onClick={handleMarkPaid}
                  disabled={busyAction === "mark-paid"}
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Mark Paid (30d Offline)
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 bg-background"
                onClick={() => setCreditModalOpen(true)}
              >
                <Zap className="h-3 w-3 text-amber-500" /> Inject Re-engagement Credits
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Double Charge Diagnostic Alert */}
      {doubleChargeWarnings.length > 0 && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10 text-destructive">
          <CreditCard className="h-5 w-5" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Potential Double Charge Flagged ({doubleChargeWarnings.length})</span>
            <Badge variant="destructive" className="text-[10px]">Action Required</Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs space-y-1.5">
            <p className="font-medium">Detected duplicate invoice / overlapping charge cycles:</p>
            <ul className="list-disc pl-5 space-y-1">
              {doubleChargeWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="pt-1 text-[11px] opacity-80">
              Check Gateway Sub ID ({billing?.razorpaySubscriptionId || "None"}) or issue a refund / credit note in the Billing tab.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Meta Ingestion Dead Token Diagnostic Banner (OAuth Code 190 / Revoked / Expired) */}
      {deadMetaSources.length > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>Critical Ingestion Failure: Facebook Page Token Dead / Revoked ({deadMetaSources.length})</span>
            </span>
            <Badge variant="destructive" className="text-[10px] font-mono">
              Root Cause: OAuth Code 190
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs space-y-2">
            <p className="font-medium text-foreground">
              Inbound lead generation has halted because Meta invalidated the Page Access Token (password change, user uninstalled app, or token expired). Webhooks are rejected.
            </p>
            <div className="space-y-2 pt-1">
              {deadMetaSources.map((src) => (
                <div
                  key={src.id}
                  className="rounded-lg border border-destructive/30 bg-background/90 p-3 text-foreground space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="font-semibold text-xs flex items-center gap-2 flex-wrap">
                      <span>{src.name}</span>
                      {src.pageId && (
                        <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          Page ID: {src.pageId}
                        </span>
                      )}
                      <Badge variant="destructive" className="text-[10px]">
                        {src.tokenStatus === "expired" ? "Expired Token" : "Dead (OAuth Code 190)"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs gap-1.5 shadow-sm"
                        disabled={busyAction === "impersonate"}
                        onClick={() => handleImpersonate(false, "/settings/integrations")}
                        title="Impersonate tenant and open Facebook connection page"
                      >
                        <UserCheck className="h-3.5 w-3.5" /> Impersonate &amp; Reconnect
                      </Button>
                      {src.pageId && (src.authFailedEventsCount ?? 0) > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={replayingPageId === src.pageId}
                          onClick={() => handleReplayAuthEvents(src.pageId!)}
                          title="Replay dropped lead payloads into ingestion worker"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${replayingPageId === src.pageId ? "animate-spin" : ""}`} />
                          Replay {src.authFailedEventsCount} Dropped Lead{src.authFailedEventsCount === 1 ? "" : "s"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {src.authErrorMessage && (
                    <div className="text-[11px] text-destructive font-mono bg-destructive/5 p-2 rounded border border-destructive/20 break-words">
                      {src.authErrorMessage}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Dropped events in DLQ: <span className="font-semibold text-destructive">{src.authFailedEventsCount ?? 0}</span>.
                    Once reconnected via OAuth, click &ldquo;Replay Dropped Leads&rdquo; to ingest missed customer leads without data loss.
                  </p>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Meta Token Expiring Soon Warning */}
      {deadMetaSources.length === 0 && expiringMetaSources.length > 0 && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Facebook Page Token Expiring Soon ({expiringMetaSources.length})</span>
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
              Expiring in {expiringMetaSources[0].tokenDaysRemaining}d
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs space-y-1.5">
            <p>
              Page access token on &ldquo;{expiringMetaSources[0].name}&rdquo; (Page ID: {expiringMetaSources[0].pageId || "N/A"}) will expire in {expiringMetaSources[0].tokenDaysRemaining} days. Reconnect required before ingestion halts.
            </p>
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 bg-background"
                disabled={busyAction === "impersonate"}
                onClick={() => handleImpersonate(false, "/settings/integrations")}
              >
                <UserCheck className="h-3.5 w-3.5" /> Impersonate &amp; Refresh Token
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Leads Stalled Diagnostic Alert */}
      {leadsStalledWarnings.length > 0 && (
        <Alert className="border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-200">
          <Radio className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Inbound Lead Ingestion & Integration Status</span>
            <span className="text-xs font-normal opacity-80">
              {sourceCount} configured source{sourceCount === 1 ? "" : "s"}
            </span>
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs space-y-1.5">
            <ul className="list-disc pl-5 space-y-1">
              {leadsStalledWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Health & Recency */}
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Activity Recency</span>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-xl font-bold">
              {daysInactive === 0 ? "Active Today" : `${daysInactive}d ago`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Last seen: {health?.lastActiveAt ? new Date(health.lastActiveAt).toLocaleDateString() : "Never"}
          </CardContent>
        </Card>

        {/* Billing Status */}
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Billing Lifecycle</span>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-xl font-bold capitalize">
              {billing?.status ? billing.status.replace("_", " ") : "Unknown"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            {billing?.status === "grace_period"
              ? `${billing.daysRemainingInGrace}d remaining in grace`
              : billing?.status === "paid"
              ? "Good standing"
              : billing?.planStatus ?? "Active"}
          </CardContent>
        </Card>

        {/* Credits Available */}
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Available Credits</span>
              <Zap className="h-4 w-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-xl font-bold font-mono">
              {(health?.aiCredits ?? 0).toLocaleString()} AI
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground flex items-center gap-1 font-mono">
            <Radio className="h-3 w-3 text-emerald-500" />
            {(health?.whatsappCredits ?? 0).toLocaleString()} WhatsApp
          </CardContent>
        </Card>

        {/* Workload Volume */}
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs flex items-center justify-between">
              <span>Lead & Team Scale</span>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-xl font-bold">
              {leadsStats.total} leads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            {users.length} members · {leadsStats.createdLast30d} new in 30d
          </CardContent>
        </Card>
      </div>

      {/* Deep-Dive 6 Tabs Profile */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted/60 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="usage" className="text-xs">
            Leads &amp; Integrations ({leadsStats.total})
          </TabsTrigger>
          <TabsTrigger value="billing" className="text-xs">
            Billing &amp; Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="tickets" className="text-xs">
            Support ({openTickets.length > 0 ? `${openTickets.length} open` : tickets.length})
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs">
            Team & Access ({users.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">
            Audit Trail ({auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Organization Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Organization Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Company Name:</span>
                  <span className="font-semibold text-foreground">{org.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Workspace Slug:</span>
                  <span className="font-mono text-foreground">{org.slug}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Industry:</span>
                  <span>{org.industry || "Not specified"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Phone:</span>
                  <span>{org.phone || "—"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Website:</span>
                  {org.website ? (
                    <a
                      href={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {org.website} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Location:</span>
                  <span>
                    {[org.city, org.state, org.country].filter(Boolean).join(", ") || "Not configured"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">WhatsApp Mode:</span>
                  <span className="capitalize font-mono">{org.whatsappMode}</span>
                </div>
              </CardContent>
            </Card>

            {/* Engagement & Churn Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" /> Churn Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Health Tier:</span>
                  <span className="font-semibold capitalize">{healthStatus.replace("_", " ")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Days Inactive:</span>
                  <span className="font-semibold text-foreground">{daysInactive} days</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">30-Day Lead Growth:</span>
                  <span>{leadsStats.createdLast30d} leads</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Open Support Tickets:</span>
                  <span className={openTickets.length > 0 ? "font-semibold text-amber-600" : ""}>
                    {openTickets.length} open ({urgentTickets.length} urgent)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Payment Status:</span>
                  <span className={billing?.status === "grace_period" ? "text-destructive font-semibold" : ""}>
                    {billing?.status === "grace_period"
                      ? `Grace Period (${billing.daysRemainingInGrace}d remaining)`
                      : billing?.status ?? "active"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Seat Overrides:</span>
                  <span>{data.customSeats ? `${data.customSeats} seats granted` : "Plan default"}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: LEADS & INTEGRATIONS */}
        <TabsContent value="usage" className="space-y-4">
          {/* Top row: Inbound Lead Sources & Connected Services */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Inbound Lead Sources */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary" /> Inbound Lead Sources &amp; Ingestion
                  </span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {integrations?.sources?.length ?? 0} configured
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Active channels capturing leads (Facebook Lead Ads, Webhooks, API). Answers why leads may have stopped.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                        <th className="p-2.5 pl-4">Source Name</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Ingestion Status</th>
                        <th className="p-2.5">Token / Auth Health</th>
                        <th className="p-2.5 pr-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {!integrations?.sources || integrations.sources.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            No inbound lead sources found. Leads are only captured via manual entry.
                          </td>
                        </tr>
                      ) : (
                        integrations.sources.map((src) => (
                          <tr key={src.id} className="hover:bg-muted/20">
                            <td className="p-2.5 pl-4">
                              <div className="font-medium text-foreground">{src.name}</div>
                              {src.pageId && (
                                <div className="text-[10px] font-mono text-muted-foreground">
                                  Page ID: {src.pageId}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] capitalize">{src.type?.replace(/_/g, " ") || "webhook"}</td>
                            <td className="p-2.5">
                              {src.isActive ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                  Active Ingestion
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  Inactive / Stopped
                                </Badge>
                              )}
                            </td>
                            <td className="p-2.5">
                              {src.tokenStatus === "dead" ? (
                                <div className="space-y-1">
                                  <Badge variant="destructive" className="text-[10px] gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Dead (Code 190)
                                  </Badge>
                                  {src.authErrorMessage && (
                                    <div className="text-[10px] text-destructive max-w-[200px] truncate" title={src.authErrorMessage}>
                                      {src.authErrorMessage}
                                    </div>
                                  )}
                                  {(src.authFailedEventsCount ?? 0) > 0 && (
                                    <div className="text-[10px] font-semibold text-destructive">
                                      {src.authFailedEventsCount} dropped lead{src.authFailedEventsCount === 1 ? "" : "s"}
                                    </div>
                                  )}
                                </div>
                              ) : src.tokenStatus === "expired" ? (
                                <div className="space-y-1">
                                  <Badge variant="destructive" className="text-[10px] gap-1">
                                    <Clock className="h-3 w-3" /> Token Expired
                                  </Badge>
                                  {src.tokenExpiresAt && (
                                    <div className="text-[10px] text-muted-foreground">
                                      Expired {new Date(src.tokenExpiresAt).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>
                              ) : src.tokenStatus === "expiring_soon" ? (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] gap-1">
                                  <Clock className="h-3 w-3" /> Expiring in {src.tokenDaysRemaining}d
                                </Badge>
                              ) : src.tokenStatus === "healthy" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Healthy {src.tokenDaysRemaining !== null && src.tokenDaysRemaining !== undefined ? `(${src.tokenDaysRemaining}d)` : ""}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">—</span>
                              )}
                            </td>
                            <td className="p-2.5 pr-4 text-right space-x-1 whitespace-nowrap">
                              {src.pageId && (src.authFailedEventsCount ?? 0) > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                                  disabled={replayingPageId === src.pageId}
                                  onClick={() => handleReplayAuthEvents(src.pageId!)}
                                  title="Replay dropped lead events into ingestion worker"
                                >
                                  <RefreshCw className={`h-3 w-3 ${replayingPageId === src.pageId ? "animate-spin" : ""}`} />
                                  Replay ({src.authFailedEventsCount})
                                </Button>
                              )}
                              {(src.type === "facebook_lead_ads" || src.pageId) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary"
                                  disabled={busyAction === "impersonate"}
                                  onClick={() => handleImpersonate(false, "/settings/integrations")}
                                  title="Impersonate tenant and open Facebook reconnection page"
                                >
                                  <UserCheck className="h-3 w-3" /> Reconnect
                                </Button>
                              )}
                              {!src.pageId && (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {new Date(src.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Connected Intelligence & Marketing Services */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" /> Connected Integrations
                </CardTitle>
                <CardDescription className="text-xs">
                  Native tenant-level data integrations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Meta CAPI:</span>
                  {integrations?.settings?.capiEnabled ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                      Active ({integrations.settings.capiPixelId?.slice(0, 8)}...)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Disabled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Lead Enrichment:</span>
                  {integrations?.settings?.enrichmentEnabled ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Disabled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Inbound Email Sync:</span>
                  {integrations?.settings?.inboundEmailEnabled ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Disabled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Outbound Endpoints:</span>
                  <span className="font-mono">{integrations?.endpoints?.length ?? 0} active</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom row: Lead Funnel & DLQ Webhook Failures */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Lead Funnel Distribution</CardTitle>
                <CardDescription className="text-xs">Total {leadsStats.total} leads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {Object.keys(leadsStats.byStatus).length === 0 ? (
                  <p className="text-muted-foreground">No leads captured yet.</p>
                ) : (
                  Object.entries(leadsStats.byStatus).map(([status, count]) => {
                    const pct = leadsStats.total > 0 ? Math.round((count / leadsStats.total) * 100) : 0;
                    return (
                      <div key={status} className="space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="capitalize">{status}</span>
                          <span className="font-mono font-medium text-foreground">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>DLQ Webhook Failures</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {failedDeliveries.length} failed
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Failed outbound delivery events recorded for this organization
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                        <th className="p-2.5 pl-4">Event</th>
                        <th className="p-2.5">Endpoint URL</th>
                        <th className="p-2.5">Error Reason</th>
                        <th className="p-2.5 pr-4 text-right">Failed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {failedDeliveries.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-muted-foreground">
                            No webhook delivery errors.
                          </td>
                        </tr>
                      ) : (
                        failedDeliveries.map((dlq) => (
                          <tr key={dlq.id} className="hover:bg-muted/20">
                            <td className="p-2.5 pl-4 font-mono font-medium">{dlq.event}</td>
                            <td className="p-2.5 font-mono text-[11px] truncate max-w-[200px]" title={dlq.url}>
                              {dlq.url}
                            </td>
                            <td className="p-2.5 text-destructive truncate max-w-[180px]" title={dlq.errorReason ?? ""}>
                              {dlq.errorReason ?? "Unknown error"}
                            </td>
                            <td className="p-2.5 pr-4 text-right text-muted-foreground">
                              {new Date(dlq.failedAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: BILLING & INVOICES */}
        <TabsContent value="billing" className="space-y-4">
          {/* Double Charge Audit Alert Box */}
          {doubleChargeWarnings.length > 0 ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive space-y-2">
              <div className="font-semibold flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4" /> Double Charge Detected for this Tenant
              </div>
              <p>The following overlapping paid invoices were generated within the same billing cycle:</p>
              <ul className="list-disc pl-5 space-y-1">
                {doubleChargeWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <p className="opacity-90 pt-1">
                Review Gateway Subscription ID ({billing?.razorpaySubscriptionId || "None"}) or issue a refund / void receipt below.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Double Charge Audit: Clean — No overlapping charges or duplicate payments detected.
              </span>
              <span className="font-mono text-[11px] opacity-80">{invoices.length} total invoice(s)</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Subscription & Lifecycle Summary */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Subscription & Lifecycle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className="capitalize">
                    {billing?.status ? billing.status.replace("_", " ") : "free"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-semibold capitalize">{org.plan}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground">Gateway Sub ID:</span>
                  <span className="font-mono truncate max-w-[140px]" title={billing?.razorpaySubscriptionId ?? ""}>
                    {billing?.razorpaySubscriptionId || "None"}
                  </span>
                </div>
                {billing?.lastPaymentFailureAt && (
                  <div className="space-y-1 rounded bg-destructive/10 p-2.5 text-destructive">
                    <p className="font-semibold">Last Payment Failure:</p>
                    <p>{new Date(billing.lastPaymentFailureAt).toLocaleString()}</p>
                    <p className="text-[11px] opacity-90">{billing.failureReason}</p>
                  </div>
                )}
                {billing?.gracePeriodEndsAt && (
                  <div className="space-y-1 rounded bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
                    <p className="font-semibold">Grace Period Active:</p>
                    <p>Ends: {new Date(billing.gracePeriodEndsAt).toLocaleDateString()}</p>
                    <p className="text-[11px]">{billing.daysRemainingInGrace} days remaining</p>
                  </div>
                )}
                <div className="pt-2 flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs justify-start gap-2"
                    onClick={handleExtendGrace}
                    disabled={busyAction === "extend-grace"}
                  >
                    <Clock className="h-3.5 w-3.5" /> Extend Grace (+7 Days)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs justify-start gap-2"
                    onClick={handleMarkPaid}
                    disabled={busyAction === "mark-paid"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Grant 30d Paid Offline
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs justify-start gap-2"
                    onClick={handleSendDunning}
                    disabled={busyAction === "dunning"}
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-500" /> Dispatch Dunning Notice
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Invoices List */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Tax Invoices & Billing History</CardTitle>
                <CardDescription className="text-xs">Generated GST invoices for this tenant</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                        <th className="p-2.5 pl-4">Invoice #</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Plan</th>
                        <th className="p-2.5">Amount</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            No invoices generated for this organization.
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-muted/20">
                            <td className="p-2.5 pl-4 font-mono font-medium text-foreground">{inv.invoiceNumber}</td>
                            <td className="p-2.5 text-muted-foreground">
                              {new Date(inv.issuedAt).toLocaleDateString()}
                            </td>
                            <td className="p-2.5 capitalize">{inv.plan}</td>
                            <td className="p-2.5 font-mono font-medium">₹{inv.totalAmount.toLocaleString()}</td>
                            <td className="p-2.5">
                              {inv.status === "paid" && (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                  Paid
                                </Badge>
                              )}
                              {inv.status === "issued" && (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                  Issued
                                </Badge>
                              )}
                              {inv.status === "void" && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Void
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: SUPPORT TICKETS */}
        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Support Tickets ({tickets.length})</span>
                <span className="text-xs font-normal text-muted-foreground">{openTickets.length} unresolved</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                      <th className="p-2.5 pl-4">Subject</th>
                      <th className="p-2.5">Requester</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5">Priority</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">SLA Deadline</th>
                      <th className="p-2.5 pr-4 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tickets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No support tickets on record for this tenant.
                        </td>
                      </tr>
                    ) : (
                      tickets.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/20">
                          <td className="p-2.5 pl-4 font-medium text-foreground max-w-[240px] truncate" title={t.subject}>
                            {t.subject}
                          </td>
                          <td className="p-2.5 text-muted-foreground">{t.userEmail}</td>
                          <td className="p-2.5 capitalize">{t.category.replace("_", " ")}</td>
                          <td className="p-2.5">
                            <Badge
                              variant="outline"
                              className={`capitalize text-[10px] ${
                                t.priority === "urgent" || t.priority === "high"
                                  ? "border-destructive/30 text-destructive bg-destructive/10"
                                  : ""
                              }`}
                            >
                              {t.priority}
                            </Badge>
                          </td>
                          <td className="p-2.5">
                            <Badge
                              variant="outline"
                              className={`capitalize text-[10px] ${
                                t.status === "open"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  : t.status === "in_progress"
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              }`}
                            >
                              {t.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {new Date(t.slaDeadline).toLocaleDateString()}
                          </td>
                          <td className="p-2.5 pr-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {t.status !== "resolved" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => handleTicketStatus(t.id, "resolved")}
                                >
                                  Resolve
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => handleTicketStatus(t.id, "open")}
                                >
                                  Reopen
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: TEAM & SECURITY */}
        <TabsContent value="team" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Members Table */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Team Members ({users.length})</CardTitle>
                <CardDescription className="text-xs">Active accounts belonging to this organization</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                        <th className="p-2.5 pl-4">Name</th>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5">Role</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 pr-4 text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            No members found.
                          </td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id} className="hover:bg-muted/20">
                            <td className="p-2.5 pl-4 font-medium text-foreground">
                              {[u.firstName, u.lastName].filter(Boolean).join(" ") || "Unnamed User"}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-muted-foreground">{u.email}</td>
                            <td className="p-2.5">
                              <Badge variant="outline" className="capitalize text-[10px]">
                                {u.roleName || "member"}
                              </Badge>
                            </td>
                            <td className="p-2.5">
                              {u.isActive ? (
                                <span className="text-emerald-600 font-medium text-[11px]">Active</span>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">Inactive</span>
                              )}
                            </td>
                            <td className="p-2.5 pr-4 text-right text-muted-foreground">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* API Keys & Security Actions */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Fleet API Keys ({apiKeys.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border text-xs">
                    {apiKeys.length === 0 ? (
                      <p className="p-4 text-center text-muted-foreground">No API keys created.</p>
                    ) : (
                      apiKeys.map((k) => (
                        <div key={k.id} className="p-3 space-y-1">
                          <div className="flex items-center justify-between font-medium">
                            <span>{k.name}</span>
                            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{k.prefix}…</span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                            <span>Scope: {k.scope}</span>
                            <span>{k.revokedAt ? "Revoked" : "Active"}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-destructive flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" /> Emergency Security
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2 text-xs">
                  <p className="text-muted-foreground">
                    Instantly invalidate all authentication tokens and sessions for every member of this workspace.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    disabled={busyAction === "revoke-sessions"}
                    onClick={handleRevokeSessions}
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke All Active Sessions
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-destructive flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4" /> Offboarding & Data Erasure (GDPR / DPDP)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3 text-xs">
                  <p className="text-muted-foreground">
                    Fulfill data portability and right to erasure requests for canceling tenants.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      disabled={exportingDossier}
                      onClick={handleExportDossier}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {exportingDossier ? "Exporting..." : "Export Tenant Dossier"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      onClick={() => {
                        setConfirmSlug("");
                        setDeleteModalOpen(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Hard Delete Tenant
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 6: AUDIT TRAIL */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Recent Audit Trail</span>
                <span className="text-xs text-muted-foreground font-normal">Last {auditLogs.length} events</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                      <th className="p-2.5 pl-4">Timestamp</th>
                      <th className="p-2.5">Actor</th>
                      <th className="p-2.5">Action</th>
                      <th className="p-2.5">Entity</th>
                      <th className="p-2.5 pr-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          No audit events recorded for this organization.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/20">
                          <td className="p-2.5 pl-4 text-muted-foreground whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-medium text-foreground">
                            {log.actorName || log.actorEmail || "System"}
                          </td>
                          <td className="p-2.5 font-mono text-[11px]">{log.action}</td>
                          <td className="p-2.5 text-muted-foreground capitalize">{log.entityType || "—"}</td>
                          <td className="p-2.5 pr-4 text-right font-mono text-[10px] text-muted-foreground truncate max-w-[200px]">
                            {JSON.stringify(log.metadata)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grant Credits Modal */}
      <Dialog open={creditModalOpen} onOpenChange={setCreditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Grant Credits to {org.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <p className="text-muted-foreground">
              Directly inject operational credits into this tenant&apos;s balance to resolve churn risk or test high-volume features.
            </p>
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Additional AI Credits
              </label>
              <Input
                type="number"
                value={aiGrant}
                onChange={(e) => setAiGrant(e.target.value)}
                placeholder="e.g. 500"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-foreground flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-emerald-500" /> Additional WhatsApp Credits
              </label>
              <Input
                type="number"
                value={whatsappGrant}
                onChange={(e) => setWhatsappGrant(e.target.value)}
                placeholder="e.g. 250"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreditModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleGrantCredits} disabled={granting} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {granting ? "Granting..." : "Confirm Grant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Tenant Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Permanently Hard-Delete {org.name}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              This action is <strong>irreversible</strong> under DPDP 2023 / GDPR Article 17. It will permanently wipe:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>All <strong>{users.length}</strong> team members and credentials</li>
              <li>All <strong>{leadsStats?.total ?? 0}</strong> leads, follow-ups, and activities</li>
              <li>All API keys, webhooks, automations, and configurations</li>
              <li>Platform config overrides, seats, and credit allocations</li>
            </ul>
            <div className="p-2.5 rounded border border-destructive/30 bg-destructive/5 text-destructive space-y-1.5">
              <p className="font-semibold">
                To confirm, type the tenant slug <code className="bg-destructive/10 px-1 py-0.5 rounded font-mono">{org.slug}</code> below:
              </p>
              <Input
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={org.slug}
                className="h-8 text-xs font-mono border-destructive/40 focus-visible:ring-destructive"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleHardDeleteTenant}
              disabled={deletingTenant || (confirmSlug.trim().toLowerCase() !== org.slug.toLowerCase() && confirmSlug.trim().toLowerCase() !== org.name.toLowerCase())}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletingTenant ? "Purging Tenant..." : "Permanently Erase Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
