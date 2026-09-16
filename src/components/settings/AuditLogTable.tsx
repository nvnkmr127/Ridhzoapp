"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocalTime } from "@/components/LocalTime";
import { listAuditLogsPageAction } from "@/lib/actions/audit";
import { AUDIT_ACTIONS } from "@/lib/audit/actionCatalog";

export type AuditRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
  actorName: string | null;
  actorEmail: string | null;
  liveActorEmail: string | null;
  liveActorFirst: string | null;
  liveActorLast: string | null;
};

const ALL_ACTIONS = "__all__";

// Prefer the identity snapshotted at write time (what the actor was called when this happened);
// fall back to the live join for rows written before that snapshot existed, then to "System".
function actorName(l: AuditRow): string {
  if (l.actorName) return l.actorName;
  if (l.actorEmail) return l.actorEmail;
  const liveName = [l.liveActorFirst, l.liveActorLast].filter(Boolean).join(" ");
  return liveName || l.liveActorEmail || "System";
}

function MetadataCell({ metadata }: { metadata: Record<string, unknown> | null }) {
  const [open, setOpen] = React.useState(false);
  const entries = metadata ? Object.entries(metadata) : [];
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  // Compact one-line summary (key=value, comma-joined); expand for the raw JSON. Cap the summary
  // length so an unusually large payload can't stretch the row.
  const summary = entries
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
  const truncated = summary.length > 140 ? summary.slice(0, 140) + "…" : summary;

  return (
    <div className="max-w-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="truncate font-mono">{truncated}</span>
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditLogTable({ initialRows, initialNextCursor }: { initialRows: AuditRow[]; initialNextCursor: string | null }) {
  const [rows, setRows] = React.useState(initialRows);
  const [cursor, setCursor] = React.useState(initialNextCursor);
  const [action, setAction] = React.useState<string>(ALL_ACTIONS);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function loadFirstPage(nextAction: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogsPageAction({ action: nextAction === ALL_ACTIONS ? undefined : nextAction });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows(res.data.rows as AuditRow[]);
      setCursor(res.data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogsPageAction({ cursor, action: action === ALL_ACTIONS ? undefined : action });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows((prev) => [...prev, ...(res.data.rows as AuditRow[])]);
      setCursor(res.data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  function onActionChange(value: string) {
    setAction(value);
    void loadFirstPage(value);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Select value={action} onValueChange={onActionChange}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
            {AUDIT_ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rows.length > 0 && <span className="text-xs text-muted-foreground">{rows.length} shown</span>}
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="border rounded-2xl bg-card divide-y text-sm">
        {rows.length === 0 && !loading && <div className="p-6 text-muted-foreground">No activity recorded yet.</div>}
        {rows.map((l) => (
          <div key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{l.action}</span>
              <span className="text-muted-foreground">{actorName(l)}</span>
              {l.entityType && (
                <span className="text-muted-foreground">
                  {l.entityType}
                  {l.entityId && <span className="ml-1 font-mono text-xs text-muted-foreground/70">{l.entityId.slice(0, 8)}</span>}
                </span>
              )}
              <MetadataCell metadata={l.metadata} />
            </div>
            <LocalTime iso={new Date(l.createdAt).toISOString()} className="text-xs text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
