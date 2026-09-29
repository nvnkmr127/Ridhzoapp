"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Radio,
  Activity,
  CheckCircle2,
  XCircle,
  Megaphone,
  Database,
  TrendingUp,
  Shield,
  LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlatformConsoleProps } from "./console/types";
import { TenantsTab } from "./console/TenantsTab";
import { UsersTab } from "./console/UsersTab";
import { EscalationsTab } from "./console/EscalationsTab";
import { DlqTab } from "./console/DlqTab";
import { SystemTab } from "./console/SystemTab";
import { ComplianceTab } from "./console/ComplianceTab";
import { RevOpsTab } from "./console/RevOpsTab";
import { SupportTab } from "./console/SupportTab";
import { AnnouncementsTab } from "./console/AnnouncementsTab";

export function PlatformConsole(props: PlatformConsoleProps) {
  const { metrics, initialTab = "tenants", revenueSummary, initialMaintenance = { enabled: false, message: "" }, initialOpsAlert, activeThreatCount: activeThreats = 0, openTicketCount = 0 } = props;
  const router = useRouter();
  type TabKey = "tenants" | "revops" | "support" | "announcements" | "compliance" | "users" | "escalations" | "dlq" | "system";
  const tab = initialTab as TabKey;
  const setTab = React.useCallback(
    (nextTab: TabKey) => router.push(`/admin?tab=${nextTab}`, { scroll: false }),
    [router]
  );

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
              {metrics?.totalOrgs ?? 0}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">orgs</span>
            </span>
            {revenueSummary && revenueSummary.mrr > 0 && (
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                ₹{revenueSummary.mrr.toLocaleString()}/mo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics?.totalUsers ?? 0} users · {revenueSummary?.paidAccounts ?? 0} paid accounts
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
          Organizations ({metrics?.totalOrgs ?? 0})
        </Button>
        <Button
          variant={tab === "revops" ? "default" : "ghost"} aria-current={tab === "revops" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("revops")}
          className="gap-1.5"
        >
          <TrendingUp className="h-3.5 w-3.5" /> Revenue &amp; Billing
        </Button>
        <Button
          variant={tab === "support" ? "default" : "ghost"} aria-current={tab === "support" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("support")}
          className="gap-1.5"
        >
          <LifeBuoy className="h-3.5 w-3.5" /> Support Desk
          {openTicketCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {openTicketCount}
            </span>
          )}
        </Button>
        <Button
          variant={tab === "announcements" ? "default" : "ghost"} aria-current={tab === "announcements" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("announcements")}
          className="gap-1.5"
        >
          <Megaphone className="h-3.5 w-3.5" /> Announcements
          {initialMaintenance.enabled && (
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
          Global Users ({metrics?.totalUsers ?? 0})
        </Button>
        <Button
          variant={tab === "escalations" ? "default" : "ghost"} aria-current={tab === "escalations" ? "page" : undefined}
          size="sm"
          onClick={() => setTab("escalations")}
          className="gap-1.5"
        >
          Overdue Leads
          {(metrics?.activeEscalations ?? 0) > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              {metrics?.activeEscalations}
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
          {(metrics?.failedDeliveries ?? 0) > 0 && (
            <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-xs font-medium text-destructive">
              {metrics?.failedDeliveries}
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
          {activeThreats > 0 && (
            <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive animate-pulse">
              {activeThreats} Threat{activeThreats > 1 ? "s" : ""}
            </span>
          )}
          {initialOpsAlert?.enabled && (
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
              Alerts ON
            </span>
          )}
        </Button>
      </div>

      {/* Tab: Organizations */}
      {tab === "tenants" && <TenantsTab {...props} />}
      {tab === "users" && <UsersTab {...props} />}
      {tab === "escalations" && <EscalationsTab {...props} />}
      {tab === "dlq" && <DlqTab {...props} />}
      {tab === "system" && <SystemTab {...props} />}
      {tab === "compliance" && <ComplianceTab {...props} />}
      {tab === "revops" && <RevOpsTab {...props} />}
      {tab === "support" && <SupportTab {...props} />}
      {tab === "announcements" && <AnnouncementsTab {...props} />}
    </div>
  );
}
