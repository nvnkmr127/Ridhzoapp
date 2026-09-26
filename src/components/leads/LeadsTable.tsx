"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { saveLeadListContext } from "@/lib/leads/listContext";
import type { StatusCategory } from "@/domains/leads/customStatusSchemaService";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Download, Tag, MessageCircle, Trash } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendCampaignAction } from "@/lib/actions/campaigns";
import { useToast } from "@/hooks/use-toast";
import { listUsersAction } from "@/lib/actions/users";
import { bulkAssignLeadAction, bulkChangeLeadStatusAction, bulkDeleteLeadsAction, deleteLeadAction } from "@/lib/actions/leads";
import { EditLeadDialog } from "@/components/leads/EditLeadDialog";
import { bulkAddTagAction } from "@/lib/actions/tags";
import { NextBestActionService, type ActionPriority } from "@/domains/leads/nextBestActionService";
import { getTenantStatusSchemaAction } from "@/lib/actions/customStatuses";
import { exportLeadsCsvAction } from "@/lib/actions/exportLeads";
import { LocalTime } from "@/components/LocalTime";

type Lead = {
  id: string; displayId?: number | null; name: string; email: string | null; phone: string | null; status: string; createdAt: Date;
  ownerId?: string | null;
  company?: string | null;
  customData?: unknown;
  score?: number | null; lastContactedAt?: Date | null; nextFollowUpAt?: Date | null;
};

function renderCustom(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (v === true) return "✓"; if (v === false) return "—";
  return String(v);
}

const PRIORITY_VARIANT: Record<ActionPriority, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};
type User = { id: string; name: string };

const STATUSES = ["new", "active", "won", "lost", "unqualified"];

type CustomColumn = { key: string; label: string };

export function LeadsTable({
  leads,
  page = 1,
  pageSize = 20,
  total = 0,
  totalPages = 1,
  customColumns = [],
  initialUsers,
  nextMeetings = {},
  statuses,
}: {
  leads: Lead[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  customColumns?: CustomColumn[];
  initialUsers?: User[];
  /** Earliest scheduled meeting per lead id — lets the Next Best Action badge see meetings. */
  nextMeetings?: Record<string, { startAt: Date | string; durationMinutes: number; label: string }>;
  /** The workspace's statuses, from the server render — badges show their label + colour at once. */
  statuses?: { key: string; label: string; color: string; category?: StatusCategory }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [statusMap, setStatusMap] = React.useState<Map<string, { label: string; color: string; category?: StatusCategory }>>(
    () => new Map((statuses ?? []).map((x) => [x.key, { label: x.label, color: x.color, category: x.category }])),
  );

  // Status badges show the configured label + colour. Normally the page passes the schema in; only
  // fetch it when it didn't (otherwise every badge first flashed the raw key, e.g. "new").
  React.useEffect(() => {
    if (statuses?.length) return;
    getTenantStatusSchemaAction()
      .then((s) => setStatusMap(new Map((s as any[]).map((x) => [x.key, { label: x.label, color: x.color, category: x.category }]))))
      .catch(() => {});
  }, [statuses]);
  const [users, setUsers] = React.useState<User[]>(initialUsers ?? []);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!initialUsers || initialUsers.length === 0) {
      listUsersAction().then(setUsers).catch(() => {});
    }
  }, [initialUsers]);

  // Remember this list (order + filters) so a lead's profile can go back to it and step prev/next.
  React.useEffect(() => {
    saveLeadListContext({ ids: leads.map((l) => l.id), url: window.location.pathname + window.location.search });
  }, [leads]);

  const [leadToDelete, setLeadToDelete] = React.useState<Lead | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const userName = React.useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  // The whole row opens the lead — except clicks on its own controls (checkbox, links, buttons, and
  // the edit dialog / menus that portal out of it). Ctrl/⌘-click opens a new tab, like a link.
  function openRow(e: React.MouseEvent, id: string) {
    const t = e.target as HTMLElement;
    if (!e.currentTarget.contains(t) || t.closest("a,button,input,label,[role=menuitem],[role=dialog]")) return;
    if (window.getSelection()?.toString()) return; // selecting text to copy, not opening
    if (e.metaKey || e.ctrlKey) window.open(`/leads/${id}`, "_blank");
    else router.push(`/leads/${id}`);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      const result = await fn();
      // Actions on the ActionResult contract return {ok:false,...} instead of throwing.
      if (result && typeof result === "object" && "ok" in result && (result as { ok: boolean }).ok === false) {
        toast({ variant: "destructive", title: "Bulk action failed", description: (result as { message?: string }).message });
        return;
      }
      // Surface partial-success counts when the action reports them.
      const failed = (result as { data?: { failed?: number } } | undefined)?.data?.failed ?? 0;
      toast({ title: msg, description: failed > 0 ? `${failed} could not be updated — check permissions and try again.` : undefined });
      setSelected(new Set());
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Bulk action failed", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  function goToPage(newPage: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", String(newPage));
    router.replace(`/leads?${p.toString()}`);
  }

  function changePageSize(size: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("pageSize", size);
    p.set("page", "1");
    router.replace(`/leads?${p.toString()}`);
  }

  const [tagName, setTagName] = React.useState("");

  // Export runs on the server: ticked rows, or EVERY lead matching the current search/filters (not
  // just this page), with owner/source/stage names and custom fields, formula-safe.
  const [exporting, setExporting] = React.useState(false);
  async function exportCsv(onlySelected: boolean) {
    setExporting(true);
    try {
      const get = (k: string) => searchParams.get(k) || undefined;
      const res = await exportLeadsCsvAction({
        search: get("search"),
        status: get("status"),
        owner: get("owner"),
        filters: get("filters"),
        sort: get("sort"),
        order: (get("order") as "asc" | "desc" | undefined) ?? undefined,
        ids: onlySelected ? Array.from(selected) : undefined,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Export failed", description: res.message });
        return;
      }
      const url = URL.createObjectURL(new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: `Exported ${res.data.count} lead${res.data.count === 1 ? "" : "s"}`,
        description: res.data.truncated ? `Limited to the first ${res.data.count} of ${res.data.total}. Narrow the filters to export the rest.` : undefined,
      });
    } catch {
      toast({ variant: "destructive", title: "Export failed", description: "We couldn't reach the server. Please try again." });
    } finally {
      setExporting(false);
    }
  }

  const ids = () => Array.from(selected);
  const [msgOpen, setMsgOpen] = React.useState(false);
  const [msgBody, setMsgBody] = React.useState("");
  const [msgSending, setMsgSending] = React.useState(false);

  async function sendCampaign() {
    setMsgSending(true);
    try {
      const res = await sendCampaignAction({ leadIds: ids(), body: msgBody });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't send", description: res.message });
        return;
      }
      const { sent, failed } = res.data;
      toast({
        title: `Message sent to ${sent} lead${sent === 1 ? "" : "s"}`,
        description: failed ? `${failed} couldn't auto-send — logged for manual send.` : undefined,
      });
      setMsgBody(""); setMsgOpen(false); setSelected(new Set());
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't send", description: "We couldn't reach the server. Please try again." });
    } finally {
      setMsgSending(false);
    }
  }

  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select
            disabled={busy}
            onValueChange={(userId) =>
              run(() => bulkAssignLeadAction({ leadIds: ids(), ownerId: userId, teamId: null }), "Leads assigned")
            }
          >
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="Assign to…" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={busy}
            onValueChange={(status) =>
              run(() => bulkChangeLeadStatusAction({ leadIds: ids(), status }), "Status updated")
            }
          >
            <SelectTrigger className="w-44 bg-card">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {(statusMap.size ? [...statusMap.entries()].map(([key, v]) => ({ key, label: v.label })) : STATUSES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1) }))).map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="Add tag..."
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              className="w-36 h-9 bg-card text-sm"
              disabled={busy}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !tagName.trim()}
              onClick={() => {
                run(() => bulkAddTagAction(ids(), tagName.trim()), `Tag "${tagName}" added to leads`);
                setTagName("");
              }}
              className="h-9 gap-1"
            >
              <Tag className="h-3.5 w-3.5" />
              Tag
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setMsgOpen((o) => !o)}
            className="h-9 gap-1.5"
          >
            <MessageCircle className="h-4 w-4" />
            Message
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportCsv(true)}
            disabled={exporting}
            className="h-9 gap-1.5 ml-auto"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setBulkDeleteOpen(true)}
            className="h-9 gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash className="h-4 w-4" />
            Delete
          </Button>
        </div>
      )}

      {selected.size > 0 && msgOpen && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <p className="text-sm font-medium">Message {selected.size} selected lead{selected.size === 1 ? "" : "s"} on WhatsApp</p>
          <Textarea
            placeholder="Type your message… {{first_name}} is personalised per lead."
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            className="min-h-[80px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMsgOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={msgSending || msgBody.trim().length === 0} onClick={sendCampaign} className="gap-1.5">
              <MessageCircle className="h-4 w-4" />
              {msgSending ? "Sending…" : "Send to all"}
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-primary"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all leads on page"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              {customColumns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
              <TableHead>Score</TableHead>
              <TableHead>Next action</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow
                key={lead.id}
                data-state={selected.has(lead.id) ? "selected" : undefined}
                className="group cursor-pointer"
                onClick={(e) => openRow(e, lead.id)}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-primary"
                    checked={selected.has(lead.id)}
                    onChange={() => toggle(lead.id)}
                    aria-label={`Select ${lead.name}`}
                  />
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  <div className="flex items-baseline gap-2">
                    <Link href={`/leads/${lead.id}`} className="truncate font-medium text-foreground hover:underline">
                      {lead.name}
                    </Link>
                    {lead.displayId != null ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">#{lead.displayId}</span> : null}
                  </div>
                  {lead.company ? <div className="truncate text-xs text-muted-foreground">{lead.company}</div> : null}
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="block tabular-nums hover:underline" title={`Call ${lead.phone}`}>
                      {lead.phone}
                    </a>
                  ) : null}
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="block truncate text-xs text-muted-foreground hover:underline" title={lead.email}>
                      {lead.email}
                    </a>
                  ) : null}
                  {!lead.phone && !lead.email ? <span className="text-muted-foreground">—</span> : null}
                </TableCell>
                <TableCell>
                  {statusMap.get(lead.status) ? (
                    <Badge
                      variant="secondary"
                      className="border-transparent"
                      style={{ backgroundColor: `${statusMap.get(lead.status)!.color}22`, color: statusMap.get(lead.status)!.color }}
                    >
                      {statusMap.get(lead.status)!.label}
                    </Badge>
                  ) : (
                    <Badge variant={lead.status === "new" ? "default" : "secondary"} className="capitalize">{lead.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {lead.ownerId ? (
                    userName.get(lead.ownerId) ?? <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="text-amber-500">Unassigned</span>
                  )}
                </TableCell>
                {customColumns.map((c) => (
                  <TableCell key={c.key} className="text-sm text-muted-foreground max-w-[12rem] truncate">
                    {renderCustom((lead.customData as Record<string, unknown> | null)?.[c.key])}
                  </TableCell>
                ))}
                <TableCell className="text-sm font-medium">
                  {lead.score != null ? lead.score : "—"}
                </TableCell>
                <TableCell>
                  {(() => {
                    const nba = NextBestActionService.getRecommendation({
                      status: lead.status,
                      statusCategory: statusMap.get(lead.status)?.category,
                      score: lead.score ?? 0,
                      phone: lead.phone,
                      email: lead.email,
                      lastContactedAt: lead.lastContactedAt ?? null,
                      nextFollowUpAt: lead.nextFollowUpAt ?? null,
                      meeting: nextMeetings[lead.id] ?? null,
                    });
                    return (
                      <Badge variant={PRIORITY_VARIANT[nba.priority]} className="font-normal" title={nba.reason}>
                        {nba.label}
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground" suppressHydrationWarning>
                  <LocalTime iso={lead.createdAt} mode="relative" />
                </TableCell>
                <TableCell className="text-right">
                  {/* Row actions stay quiet until the row is hovered or focused — delete especially. */}
                  <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <EditLeadDialog lead={lead} compact />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Move to recycle bin"
                      aria-label={`Move ${lead.name} to recycle bin`}
                      onClick={() => setLeadToDelete(lead)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t bg-muted text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={changePageSize}>
              <SelectTrigger className="h-7 w-16 bg-card text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-2 font-medium">
              Showing {startRecord} - {endRecord} of {total} leads
            </span>
            <Button type="button" variant="ghost" size="sm" className="ml-2 h-7 gap-1 text-xs" disabled={exporting || total === 0} onClick={() => exportCsv(false)} title="Export every lead matching the current search and filters">
              <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : `Export all ${total}`}
            </Button>
          </div>

          <div className={`flex items-center space-x-1 ${totalPages <= 1 ? "hidden" : ""}`}>
            <span className="mr-2">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-card"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              aria-label="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-card"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
              aria-label="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Single Lead Confirmation Dialog */}
      <Dialog open={!!leadToDelete} onOpenChange={(open) => { if (!open) setLeadToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move lead to recycle bin?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{leadToDelete?.name || "this lead"}</span>? It will be moved to the recycle bin where it can be restored within 30 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLeadToDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (leadToDelete) {
                  const target = leadToDelete;
                  setLeadToDelete(null);
                  run(() => deleteLeadAction(target.id), `"${target.name || "Lead"}" moved to recycle bin`);
                }
              }}
            >
              {busy ? "Moving..." : "Move to Recycle Bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selected.size} leads to recycle bin?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{selected.size} selected lead{selected.size === 1 ? "" : "s"}</span>? They will be moved to the recycle bin where they can be restored within 30 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const count = selected.size;
                setBulkDeleteOpen(false);
                run(() => bulkDeleteLeadsAction({ leadIds: ids() }), `${count} lead${count === 1 ? "" : "s"} moved to recycle bin`);
              }}
            >
              {busy ? "Moving..." : `Move ${selected.size} Leads to Recycle Bin`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
