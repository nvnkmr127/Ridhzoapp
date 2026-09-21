"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { changeLeadStatusAction, listStageLeadsAction } from "@/lib/actions/leads";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Card = { id: string; displayId?: number | null; name: string; email: string | null; phone: string | null; status: string };

type StageState = {
  data: Card[];
  total: number;
  page: number;
  loading: boolean;
};

const DEFAULT_COLUMNS: { key: string; label: string }[] = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "unqualified", label: "Unqualified" },
];

export function KanbanBoard({
  initialStages,
  columns,
}: {
  initialStages: Record<string, { data: Card[]; total: number }>;
  columns?: { key: string; label: string }[];
}) {
  const { toast } = useToast();
  const COLUMNS = columns && columns.length ? columns : DEFAULT_COLUMNS;

  // Initialize stage state
  const [stages, setStages] = React.useState<Record<string, StageState>>(() => {
    const map: Record<string, StageState> = {};
    for (const col of COLUMNS) {
      const init = initialStages[col.key] || { data: [], total: 0 };
      map[col.key] = {
        data: init.data,
        total: init.total,
        page: 1,
        loading: false,
      };
    }
    return map;
  });

  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dragFromCol, setDragFromCol] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  async function drop(targetStatus: string) {
    setOverCol(null);
    const id = dragId;
    const fromCol = dragFromCol;
    setDragId(null);
    setDragFromCol(null);

    if (!id || !fromCol || fromCol === targetStatus) return;

    // Optimistic move
    let movedCard: Card | undefined;
    setStages((prev) => {
      const sourceList = prev[fromCol]?.data || [];
      movedCard = sourceList.find((c) => c.id === id);
      if (!movedCard) return prev;

      const newSourceData = sourceList.filter((c) => c.id !== id);
      const targetList = prev[targetStatus]?.data || [];
      const updatedCard = { ...movedCard, status: targetStatus };
      const newTargetData = [updatedCard, ...targetList];

      return {
        ...prev,
        [fromCol]: {
          ...prev[fromCol],
          data: newSourceData,
          total: Math.max((prev[fromCol]?.total || 1) - 1, 0),
        },
        [targetStatus]: {
          ...prev[targetStatus],
          data: newTargetData,
          total: (prev[targetStatus]?.total || 0) + 1,
        },
      };
    });

    const revert = (description?: string) => {
      setStages((prev) => {
        if (!movedCard) return prev;
        const targetData = (prev[targetStatus]?.data || []).filter((c) => c.id !== id);
        const sourceData = [movedCard, ...(prev[fromCol]?.data || [])];
        return {
          ...prev,
          [fromCol]: { ...prev[fromCol], data: sourceData, total: (prev[fromCol]?.total || 0) + 1 },
          [targetStatus]: { ...prev[targetStatus], data: targetData, total: Math.max((prev[targetStatus]?.total || 1) - 1, 0) },
        };
      });
      toast({ variant: "destructive", title: "Could not move lead", description });
    };

    try {
      const res = await changeLeadStatusAction(id, targetStatus);
      if (!res.ok) revert(res.message);
    } catch {
      revert("We couldn't reach the server. Please try again.");
    }
  }

  async function loadMore(status: string) {
    const current = stages[status];
    if (!current || current.loading) return;

    const nextPage = current.page + 1;
    setStages((prev) => ({
      ...prev,
      [status]: { ...prev[status], loading: true },
    }));

    try {
      const res = await listStageLeadsAction(status, nextPage, 20);
      setStages((prev) => ({
        ...prev,
        [status]: {
          data: [...prev[status].data, ...(res.data as Card[])],
          total: res.total,
          page: nextPage,
          loading: false,
        },
      }));
    } catch {
      setStages((prev) => ({
        ...prev,
        [status]: { ...prev[status], loading: false },
      }));
      toast({ variant: "destructive", title: "Failed to load more leads" });
    }
  }

  return (
    <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((col) => {
        const stage = stages[col.key] || { data: [], total: 0, page: 1, loading: false };
        const hasMore = stage.data.length < stage.total;

        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={() => drop(col.key)}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-muted ${
              overCol === col.key ? "ring-2 ring-ring" : ""
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b bg-card rounded-t-xl">
              <span className="text-sm font-semibold text-foreground">{col.label}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {stage.total}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {stage.data.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => {
                    setDragId(c.id);
                    setDragFromCol(col.key);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragFromCol(null);
                    setOverCol(null);
                  }}
                  className="rounded-lg border border-border bg-card p-3 hover:border-ring/60 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between gap-1">
                    <Link href={`/leads/${c.id}`} className="font-medium text-sm hover:underline text-foreground truncate">
                      {c.name}
                    </Link>
                    {c.displayId != null && (
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">#{c.displayId}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    {c.phone && <div className="truncate">{c.phone}</div>}
                    {c.email && <div className="truncate">{c.email}</div>}
                    {!c.phone && !c.email && <div>—</div>}
                  </div>
                </div>
              ))}

              {stage.data.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  Drop leads here
                </div>
              )}

              {hasMore && (
                <div className="pt-2 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
                    disabled={stage.loading}
                    onClick={() => loadMore(col.key)}
                  >
                    {stage.loading ? (
                      <span className="flex items-center justify-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                      </span>
                    ) : (
                      `Load more (${stage.total - stage.data.length} left)`
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
