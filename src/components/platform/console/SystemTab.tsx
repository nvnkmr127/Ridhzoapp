"use client";

import * as React from "react";
import {
  Activity,
  ShieldCheck,
  Download,
  Database,
  RefreshCw,
  Bell,
  Key,
  FileSpreadsheet,
  UserX,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  saveOpsAlertConfigAction,
  connectCliqAction,
  testOpsAlertAction,
  refreshOpsAlertLogAction,
  revokeUserSessionsAction,
  revokeOrgSessionsAction,
  exportPlatformCsvAction,
  getPlatformActivityAction,
  revokeFleetApiKeyAction,
  listAnomaliesAction,
  resolveAnomalyAction,
  remediateAnomalyAction,
} from "@/lib/actions/platform";
import type { GlobalUserSummary, OrgSummary, FleetApiKeySummary, PlatformActivitySummary } from "@/domains/platform/service";
import type { OpsWebhookView } from "@/domains/platform/opsAlertService";
import type { SecurityAnomaly } from "@/domains/platform/anomalyDetectionService";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";

export function SystemTab({ initial = [], initialUsers = [], metrics, initialOpsAlert, initialApiKeys = [], initialAnomalies = [], initialActivity = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const { toast } = useToast();
  const [orgs] = React.useState<OrgSummary[]>(initial ?? []);
  const [users] = React.useState<GlobalUserSummary[]>(initialUsers ?? []);
  const [apiKeys, setApiKeys] = React.useState<FleetApiKeySummary[]>(initialApiKeys ?? []);
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

  const handleRevokeFleetKey = async (id: string) => {
    const k = apiKeys.find((x) => x.id === id);
    if (!(await confirm({ title: `Revoke API key "${k?.name ?? id}"${k?.orgName ? ` for ${k.orgName}` : ""}?`, description: "Integrations using it stop working immediately.", confirmLabel: "Revoke key", destructive: true }))) return;
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
    if (!(await confirm({ title: "Sign out every member of this org?", description: "All their sessions end now; they must sign in again.", confirmLabel: "Revoke sessions", destructive: true }))) return;
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
    const a = anomalies.find((x) => x.id === id);
    const what = a?.suggestedAction === "suspend_org" ? `SUSPEND ${a.organizationName} (all its users are locked out)`
      : a?.suggestedAction === "terminate_sessions" ? `sign out every user of ${a.organizationName}`
      : "apply the suggested fix";
    if (!(await confirm({ title: "Run remediation?", description: `This will ${what}.`, confirmLabel: "Run it", destructive: true }))) return;
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

  // --- Support Triage & Internal Notes State ---
  const [opsAlert, setOpsAlert] = React.useState<OpsWebhookView & { cliqClientSecret?: string; cliqRefreshToken?: string }>(
    initialOpsAlert ?? {
      url: "",
      enabled: false,
      notifyOnSladeadline: true,
      notifyOnDlq: true,
      notifyOnPlanChange: true,
      notifyOnGdpr: true,
      hasCliqOAuth: false,
      recentAlerts: [],
    }
  );
  const [opsAlertSaving, setOpsAlertSaving] = React.useState(false);
  const [testingOpsAlert, setTestingOpsAlert] = React.useState(false);


  // Debounced user search

  const [grantCode, setGrantCode] = React.useState("");
  const [connectingCliq, setConnectingCliq] = React.useState(false);
  async function handleConnectCliq() {
    setConnectingCliq(true);
    const res = await connectCliqAction({ url: opsAlert.url, cliqClientId: opsAlert.cliqClientId ?? "", cliqClientSecret: opsAlert.cliqClientSecret, grantCode });
    setConnectingCliq(false);
    if (!res.ok) return toast({ variant: "destructive", title: "Couldn't connect to Zoho", description: res.message });
    setOpsAlert((prev) => ({ ...prev, ...res.data, cliqClientSecret: "", cliqRefreshToken: "" }));
    setGrantCode("");
    toast({ title: "Zoho Cliq connected", description: "Now press Test Webhook Ping." });
  }

  async function handleSaveOpsAlert() {
    setOpsAlertSaving(true);
    const res = await saveOpsAlertConfigAction(opsAlert);
    setOpsAlertSaving(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to save ops webhook", description: res.message });
    } else {
      setOpsAlert({ ...res.data, cliqClientSecret: "", cliqRefreshToken: "" });
      toast({ title: "Ops webhook configuration saved" });
    }
  }

  const [sampleEvent, setSampleEvent] = React.useState("");
  async function handleTestOpsAlert() {
    setTestingOpsAlert(true);
    const res = await testOpsAlertAction(sampleEvent || undefined);
    setTestingOpsAlert(false);
    // Refresh the "recent alerts" list either way — a failed test is logged too.
    const fresh = await refreshOpsAlertLogAction();
    if (fresh.ok) setOpsAlert((prev) => ({ ...prev, recentAlerts: fresh.data }));
    if (!res.ok) {
      toast({ variant: "destructive", title: "Webhook test failed", description: res.message });
    } else {
      toast({ title: sampleEvent ? "Sample alert delivered" : "Ping delivered successfully!", description: res.data.message });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {confirmDialog}
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
                {metrics?.storage?.recycleBinCount ?? 0} deleted leads, restorable by each workspace until their automatic 30-day purge
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Ops Webhook Alerts */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Platform Ops Webhook Alerts (Zoho Cliq)</h3>
              <p className="text-xs text-muted-foreground">
                Stream critical platform events (new support tickets, missed deadlines, failed-delivery spikes, plan changes, data requests) to your Zoho Cliq channel.
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
              placeholder="https://cliq.zoho.in/company/<id>/api/v2/channelsbyname/<channel>/message"
              value={opsAlert.url}
              onChange={(e) => setOpsAlert((prev) => ({ ...prev, url: e.target.value }))}
              className="mt-1 h-9 text-xs font-mono"
            />
          </div>

          {/* Zoho Cliq API URLs (no ?zapikey=) authenticate with OAuth; leave these blank for other webhooks. */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-foreground">Zoho Client ID</label>
              <Input value={opsAlert.cliqClientId ?? ""} onChange={(e) => setOpsAlert((prev) => ({ ...prev, cliqClientId: e.target.value }))} className="mt-1 h-9 text-xs font-mono" autoComplete="off" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Client Secret</label>
              <Input type="password" placeholder={opsAlert.hasCliqOAuth ? "•••• saved (blank keeps it)" : ""} value={opsAlert.cliqClientSecret ?? ""} onChange={(e) => setOpsAlert((prev) => ({ ...prev, cliqClientSecret: e.target.value }))} className="mt-1 h-9 text-xs font-mono" autoComplete="off" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Refresh Token</label>
              <Input type="password" placeholder={opsAlert.hasCliqOAuth ? "•••• saved (blank keeps it)" : ""} value={opsAlert.cliqRefreshToken ?? ""} onChange={(e) => setOpsAlert((prev) => ({ ...prev, cliqRefreshToken: e.target.value }))} className="mt-1 h-9 text-xs font-mono" autoComplete="off" />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-foreground">Grant code (one-time — Zoho API Console → Self Client → Generate Code)</label>
              <Input value={grantCode} onChange={(e) => setGrantCode(e.target.value)} className="mt-1 h-9 text-xs font-mono" autoComplete="off" />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs" disabled={connectingCliq || !grantCode.trim() || !opsAlert.url} onClick={handleConnectCliq}>
              {connectingCliq ? "Connecting..." : "Connect with code"}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
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
            <label className="flex items-center gap-2 cursor-pointer border rounded-lg p-2.5 bg-muted/20">
              <input
                type="checkbox"
                checked={opsAlert.notifyOnTickets !== false}
                onChange={(e) => setOpsAlert((prev) => ({ ...prev, notifyOnTickets: e.target.checked }))}
                className="rounded border-border"
              />
              <span>Support tickets &amp; replies</span>
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
              <select
                aria-label="Sample alert to send"
                value={sampleEvent}
                onChange={(e) => setSampleEvent(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Connection ping</option>
                <option value="support.new">Sample: new ticket</option>
                <option value="support.reply">Sample: tenant reply</option>
                <option value="sla.support_ticket">Sample: SLA breach</option>
                <option value="dlq.spike">Sample: failed deliveries</option>
                <option value="plan.change">Sample: plan change</option>
                <option value="compliance.request">Sample: data request</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={testingOpsAlert || !opsAlert.url}
                onClick={handleTestOpsAlert}
              >
                {testingOpsAlert ? "Sending..." : sampleEvent ? "Send sample" : "Test Webhook Ping"}
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

          {opsAlert.recentAlerts.length > 0 && (
            <div className="rounded-lg border divide-y text-xs">
              <div className="px-3 py-1.5 font-medium text-muted-foreground">Recent alerts</div>
              {opsAlert.recentAlerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <span className={a.ok ? "text-emerald-600" : "text-destructive"}>{a.ok ? "Sent" : "Failed"}</span>
                  <span className="truncate flex-1">{a.title}{a.error ? ` — ${a.error}` : ""}</span>
                  <span className="text-muted-foreground shrink-0">{new Date(a.at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
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
  );
}
