"use client";

import { adminPlanValue } from "@/domains/billing/planNames";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Eye,
  LogIn,
  Ban,
  RotateCcw,
  Search,
  Download,
  RefreshCw,
  History,
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
  bulkSetOrgSuspendedAction,
  setOrgSeatOverrideAction,
  getTenantAuditLogsAction,
} from "@/lib/actions/platform";
import type { OrgSummary, TenantAuditSummary } from "@/domains/platform/service";
const PLANS = ["free", "starter", "unlimited"];
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";
import { useImpersonate } from "./useImpersonate";

export function TenantsTab({ initial = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [orgs, setOrgs] = React.useState<OrgSummary[]>(initial ?? []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = React.useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // Meta Conversions & Ad Source Tracking State
  const [auditModalOrg, setAuditModalOrg] = React.useState<OrgSummary | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<TenantAuditSummary[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);

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
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, plan: cleanPlan, trialEndsAt: res.data.trialEndsAt, complimentary: res.data.complimentary ? 1 : 0 } : o)));
      toast({ title: isTrial ? `14-Day ${cleanPlan} trial activated` : `Plan set to ${cleanPlan}` });
    }
  }

  async function toggleSuspend(org: OrgSummary) {
    const next = !org.suspended;
    let reason: string | undefined;
    if (next) {
      const ok = await confirm({
        title: `Suspend ${org.name}?`,
        description: "Its users are blocked from signing in within a minute.",
        confirmLabel: "Suspend",
        destructive: true,
        reason: true,
      });
      if (!ok) return;
      reason = ok.reason;
    }
    setBusy(org.id);
    setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, suspended: next } : o)));
    const res = await setOrgSuspendedAction(org.id, next, reason);
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
    const ids = selectedOrgIds;
    const count = ids.length;
    if (!count) return;
    const plural = `${count} organization${count > 1 ? "s" : ""}`;
    const ok = await confirm({
      title: `${suspend ? "Suspend" : "Reactivate"} ${plural}?`,
      description: suspend ? "Their users are blocked from signing in within a minute." : undefined,
      confirmLabel: suspend ? "Suspend" : "Reactivate",
      destructive: suspend,
      reason: suspend,
    });
    if (!ok) return;

    setBulkBusy(true);
    const res = await bulkSetOrgSuspendedAction(ids, suspend, ok.reason);
    setBulkBusy(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Couldn't update", description: res.message });
      return;
    }
    // Only flip the orgs the server actually changed.
    const changed = new Set(res.data.succeeded);
    setOrgs((s) => s.map((o) => (changed.has(o.id) ? { ...o, suspended: suspend } : o)));
    setSelectedOrgIds(res.data.failed);
    if (res.data.failed.length > 0) {
      toast({ variant: "destructive", title: `${res.data.failed.length} of ${count} failed`, description: "Those are still selected — try again." });
    } else {
      toast({ title: `${plural} ${suspend ? "suspended" : "reactivated"}` });
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

  const impersonate = useImpersonate(setBusy, confirm);

  function exportOrganizationsCsv() {
    // Org names are tenant-controlled: neutralise spreadsheet formulas (=, +, -, @) and quote.
    const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const headers = ["Organization,Slug,Plan,Seats,Status,Users,Leads,Created At"];
    const rows = filteredOrgs.map((o) =>
      [
        cell(o.name),
        cell(o.slug),
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

  return (
    <>
      {confirmDialog}
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
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
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
                          <Select value={adminPlanValue(o)} onValueChange={(v) => changePlan(o, v)}>
                            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PLANS.map((p) => (
                                <SelectItem key={p} value={p} className="capitalize text-xs">
                                  {p === "free" ? "free" : `${p} (free for client)`}
                                </SelectItem>
                              ))}
                              <SelectItem value="starter_trial" className="text-xs text-amber-600 font-medium">Starter trial (14d)</SelectItem>
                              <SelectItem value="unlimited_trial" className="text-xs text-amber-600 font-medium">Unlimited trial (14d)</SelectItem>
                              {/* Display-only: the current state of a paying org. Not settable from here. */}
                              {PLANS.filter((p) => p !== "free").flatMap((p) => [
                                <SelectItem key={`${p}_paid`} value={`${p}_paid`} disabled className="capitalize text-xs">{p} (paying)</SelectItem>,
                                <SelectItem key={`${p}_unpaid`} value={`${p}_unpaid`} disabled className="capitalize text-xs text-destructive">{p} (payment due)</SelectItem>,
                              ])}
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
    </>
  );
}
