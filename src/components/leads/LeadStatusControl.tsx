"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { changeLeadStatusAction } from "@/lib/actions/leads"
import { cn } from "@/lib/utils"
import { getLossReasonsAction, getTenantStatusSchemaAction } from "@/lib/actions/customStatuses"
import { DEFAULT_LOSS_REASONS } from "@/lib/leads/lossReasons"
import type { CustomStatusItem } from "@/domains/leads/customStatusSchemaService"

// Fallback if the schema can't load — the five system defaults.
const FALLBACK: CustomStatusItem[] = [
  { key: "new", label: "New", color: "#3B82F6", category: "open", orderIndex: 1, isSystemDefault: true },
  { key: "active", label: "Active", color: "#10B981", category: "in_progress", orderIndex: 2, isSystemDefault: true },
  { key: "won", label: "Won", color: "#059669", category: "won", orderIndex: 3, isSystemDefault: true },
  { key: "lost", label: "Lost", color: "#EF4444", category: "lost", orderIndex: 4, isSystemDefault: true },
  { key: "unqualified", label: "Unqualified", color: "#6B7280", category: "unqualified", orderIndex: 5, isSystemDefault: true },
];

// Fallback until the workspace's own list loads (see Settings → statuses).
const LOSS_REASONS = DEFAULT_LOSS_REASONS;

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />;
}

export function LeadStatusControl({ leadId, status, className }: { leadId: string; status: string; className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState(status);
  const [busy, setBusy] = React.useState(false);
  const [schema, setSchema] = React.useState<CustomStatusItem[]>(FALLBACK);
  const [pendingStatus, setPendingStatus] = React.useState<string | null>(null);
  const [reasons, setReasons] = React.useState<string[]>(LOSS_REASONS);
  const [reason, setReason] = React.useState(LOSS_REASONS[0]);
  const [detail, setDetail] = React.useState("");

  React.useEffect(() => {
    setValue(status);
  }, [status]);

  React.useEffect(() => {
    getTenantStatusSchemaAction().then((s) => { if (s?.length) setSchema(s as CustomStatusItem[]); }).catch(() => {});
    getLossReasonsAction().then((r) => { if (r?.length) setReasons(r); }).catch(() => {});
  }, []);

  const byKey = React.useMemo(() => {
    const map = new Map<string, CustomStatusItem>();
    for (const s of schema) {
      map.set(s.key, s);
      map.set(s.key.toLowerCase(), s);
    }
    return map;
  }, [schema]);

  const categoryOf = (key: string) => (byKey.get(key) || byKey.get(key.toLowerCase()))?.category;
  const isLossCategory = (key: string) => {
    const cat = categoryOf(key);
    return cat === "lost" || cat === "unqualified";
  };
  // Closing (won/lost) cancels follow-ups and stops sequences — so it's always confirmed, never one stray tap.
  const isClosing = (key: string) => isLossCategory(key) || categoryOf(key) === "won";

  async function apply(next: string, lossReason?: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      const res = await changeLeadStatusAction(leadId, next, lossReason);
      if (!res.ok) {
        setValue(prev);
        toast({ variant: "destructive", title: "Could not change status", description: res.message });
        return;
      }
      toast({ title: `Status → ${byKey.get(next)?.label ?? next}` });
      router.refresh();
    } catch {
      setValue(prev);
      toast({ variant: "destructive", title: "Could not change status", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  function change(next: string) {
    if (next === value) return;
    if (isClosing(next)) {
      setPendingStatus(next);
      setReason(reasons[0]);
      setDetail("");
      return;
    }
    apply(next);
  }

  function confirmLoss() {
    if (!isLossCategory(pendingStatus!)) {
      const next = pendingStatus!;
      setPendingStatus(null);
      apply(next);
      return;
    }
    const full = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    const next = pendingStatus!;
    setPendingStatus(null);
    apply(next, full);
  }

  const current = byKey.get(value) || byKey.get((value || "").toLowerCase());

  return (
    <>
      <Select value={value} onValueChange={change} disabled={busy}>
        <SelectTrigger className={cn("w-full", className)} aria-label="Lead status">
          <SelectValue placeholder="Select status">
            {current ? (
              <span className="flex items-center gap-2">
                <Dot color={current.color} />
                <span>{current.label}</span>
              </span>
            ) : (
              (status ? status.charAt(0).toUpperCase() + status.slice(1) : "Select status")
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {schema.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              <span className="flex items-center gap-2"><Dot color={s.color} /> {s.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={!!pendingStatus} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingStatus && isLossCategory(pendingStatus)
                ? `Close this lead as ${byKey.get(pendingStatus)?.label ?? pendingStatus}?`
                : `Mark as ${byKey.get(pendingStatus ?? "")?.label ?? pendingStatus}?`}
            </DialogTitle>
            <DialogDescription>
              Pending follow-ups will be cancelled and any running sequences stopped. You can reopen the lead later by changing its status.
            </DialogDescription>
          </DialogHeader>
          {pendingStatus && isLossCategory(pendingStatus) && (
            <div className="space-y-3 py-2">
              <label className="block text-xs font-medium text-muted-foreground">Why?</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger aria-label="Reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Add a detail (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} />
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="ghost" onClick={() => setPendingStatus(null)}>Cancel</Button>
            <Button onClick={confirmLoss} disabled={busy}>
              {pendingStatus && isLossCategory(pendingStatus) ? "Close lead" : "Mark as won"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
