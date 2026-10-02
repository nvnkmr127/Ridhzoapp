"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { retryWebhookDlqAction, purgeWebhookDlqAction } from "@/lib/actions/webhooks";

type Item = { id: string; event: string; url: string; failedAt: string; reason: string; attempts: number };

// Deliveries that failed after every retry. Retry puts one back in the queue; Discard removes it for good.
export function WebhookDlqPanel({ items: initial, total }: { items: Item[]; total: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [items, setItems] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(id: string, kind: "retry" | "discard") {
    if (kind === "discard" && !(await confirm({ title: "Discard this delivery?", description: "It won't be retried and can't be recovered.", confirmLabel: "Discard", destructive: true }))) return;
    setBusy(id);
    try {
      const res = kind === "retry" ? await retryWebhookDlqAction(id) : await purgeWebhookDlqAction(id);
      if (!res.ok) {
        toast({ variant: "destructive", title: kind === "retry" ? "Couldn't retry" : "Couldn't discard", description: res.message });
        return;
      }
      setItems((p) => p.filter((x) => x.id !== id));
      toast({ title: kind === "retry" ? "Queued for another try" : "Delivery discarded" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "Check your connection, or you may not have permission for this, then try again." });
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;
  return (
    <div className="space-y-2 rounded-2xl border p-4">
      {confirmDialog}
      <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-amber-500" /> Failed deliveries</p>
      <p className="text-xs text-muted-foreground">Showing {items.length} of {total}. These gave up after repeated attempts.</p>
      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{i.event} → {i.url}</p>
            <p className="truncate text-xs text-muted-foreground">{i.reason} · {i.attempts} attempt{i.attempts === 1 ? "" : "s"} · {new Date(i.failedAt).toLocaleString()}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" className="gap-1 text-xs" disabled={busy === i.id} onClick={() => run(i.id, "retry")}><RotateCw className="h-3.5 w-3.5" /> Retry</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label="Discard delivery" disabled={busy === i.id} onClick={() => run(i.id, "discard")}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
