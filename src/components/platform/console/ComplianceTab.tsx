"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ShieldCheck,
  Search,
  Download,
  Trash2,
  RefreshCw,
  Shield,
  Clock,
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
  searchDsrSubjectAction,
  exportDsrDossierAction,
  executeRightToBeForgottenAction,
  exportTenantDossierAction,
  hardDeleteTenantAction,
  triggerSuspensionRetentionScanAction,
} from "@/lib/actions/platform";
import type { SubjectMatch } from "@/domains/platform/complianceService";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";

export function ComplianceTab({ initial = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const { toast } = useToast();
  const [dsrQuery, setDsrQuery] = React.useState("");
  const [dsrResults, setDsrResults] = React.useState<SubjectMatch[]>([]);
  const [dsrSearching, setDsrSearching] = React.useState(false);
  const [dsrBusyId, setDsrBusyId] = React.useState<string | null>(null);

  // Tenant Offboarding & Erasure state
  const [offboardOrgId, setOffboardOrgId] = React.useState<string>(initial[0]?.id ?? "");
  const [exportingTenantDossier, setExportingTenantDossier] = React.useState(false);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = React.useState(false);
  const [hardDeleteConfirmInput, setHardDeleteConfirmInput] = React.useState("");
  const [hardDeleteReason, setHardDeleteReason] = React.useState("");
  const [hardDeletingTenant, setHardDeletingTenant] = React.useState(false);
  const [runningRetentionScan, setRunningRetentionScan] = React.useState(false);

  // Ops Webhook state
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
    const ok = await confirm({
      title: `Permanently erase "${name}"?`,
      description: "Erases their phone, email, notes and activity history. Pipeline totals are kept for reporting. This can't be undone.",
      confirmLabel: "Erase personal data",
      destructive: true,
    });
    if (!ok) return;
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
      const res = await hardDeleteTenantAction(offboardOrgId, hardDeleteConfirmInput.trim(), hardDeleteReason.trim());
      if (!res.ok) {
        toast({ title: "Deletion Failed", description: res.message, variant: "destructive" });
        return;
      }
      toast({ title: "Tenant Erased", description: `Permanently removed ${targetOrg.name} and all data.` });
      setHardDeleteModalOpen(false);
      setHardDeleteConfirmInput("");
      setHardDeleteReason("");
      router.refresh();
    } catch {
      toast({ title: "Deletion Failed", description: "Failed to erase tenant.", variant: "destructive" });
    } finally {
      setHardDeletingTenant(false);
    }
  }

  async function handleRunRetentionScan() {
    // Can permanently anonymize suspended workspaces (those warned 14+ days ago) — type to confirm.
    if (window.prompt("This can PERMANENTLY anonymize long-suspended workspaces whose owners were already warned. Type ANONYMIZE to run it now.")?.trim() !== "ANONYMIZE") return;
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

  return (
    <>
      {confirmDialog}
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
                <div className="space-y-1.5">
                  <Label htmlFor="hard-delete-reason" className="text-xs">Reason (saved to the audit log)</Label>
                  <Textarea
                    id="hard-delete-reason"
                    rows={2}
                    maxLength={500}
                    value={hardDeleteReason}
                    onChange={(e) => setHardDeleteReason(e.target.value)}
                    placeholder="e.g. Account closure requested by owner, ticket #123"
                    className="text-xs"
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
                  disabled={hardDeletingTenant || !slugMatch || hardDeleteReason.trim().length < 3}
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
    </>
  );
}
