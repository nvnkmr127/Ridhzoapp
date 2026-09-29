"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";
import { useImpersonate } from "./useImpersonate";

export function EscalationsTab({ escalations = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = React.useState<string | null>(null);
  const impersonate = useImpersonate(setBusy, confirm);

  return (
    <div className="rounded-2xl border overflow-hidden">
      {confirmDialog}
      <div className="p-4 bg-muted/20 border-b">
        <h3 className="text-sm font-semibold">Overdue Leads Across All Tenants</h3>
        <p className="text-xs text-muted-foreground">Leads that went past your response deadline with no salesperson contact.</p>
      </div>
      {escalations.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No active SLA escalations. All tenant leads are currently within SLA limits.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Lead Name</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Escalated At</th>
                <th className="px-4 py-3 font-medium text-right">Support Action</th>
              </tr>
            </thead>
            <tbody>
              {escalations.map((esc) => (
                <tr key={esc.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{esc.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{esc.orgName}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                      {esc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(esc.escalatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy === esc.id}
                      onClick={() => impersonate(esc.orgId, `/leads/${esc.id}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Impersonate &amp; Resolve
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
