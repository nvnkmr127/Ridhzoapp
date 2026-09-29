"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { retryAllFailedDeliveriesAction } from "@/lib/actions/platform";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";
import { useImpersonate } from "./useImpersonate";

export function DlqTab({ dlq = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const impersonate = useImpersonate(setBusy, confirm);

  async function handleRetryAllDlq() {
    if (!(await confirm({ title: "Retry failed deliveries?", description: "Retries up to 100 failed webhook deliveries across ALL tenants. Their endpoints will receive these events again.", confirmLabel: "Retry all" }))) return;
    setBusy("dlq_retry");
    const res = await retryAllFailedDeliveriesAction();
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to retry deliveries", description: res.message });
    } else {
      toast({ title: `Enqueued ${res.data.retried} failed webhook deliveries for retry` });
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl border overflow-hidden">
      {confirmDialog}
      <div className="p-4 bg-muted/20 border-b flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Failed Webhook Deliveries (Dead Letter Queue)</h3>
          <p className="text-xs text-muted-foreground">Failed outbound integrations requiring tenant webhook endpoint inspection.</p>
        </div>
        {dlq.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={busy === "dlq_retry"}
            onClick={handleRetryAllDlq}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry All Failed
          </Button>
        )}
      </div>
      {dlq.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No failed deliveries in DLQ. Outbound webhooks are healthy.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Target URL</th>
                <th className="px-4 py-3 font-medium">Error Reason</th>
                <th className="px-4 py-3 font-medium">Failed At</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {dlq.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{item.event}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.orgName}</td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate" title={item.url}>
                    {item.url}
                  </td>
                  <td className="px-4 py-3 text-xs text-destructive max-w-[200px] truncate" title={item.errorReason ?? ""}>
                    {item.errorReason ?? "Unknown failure"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(item.failedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy === item.id}
                      onClick={() => impersonate(item.orgId, "/settings/webhooks")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Inspect DLQ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
