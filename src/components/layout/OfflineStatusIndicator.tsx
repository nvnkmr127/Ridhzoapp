"use client";

import * as React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { Button } from "@/components/ui/button";

export function OfflineStatusIndicator({ organizationId }: { organizationId?: string } = {}) {
  const { isOnline, pendingCount, failedCount, isSyncing, syncNow, retryFailed, discardFailed } = useOfflineSync(organizationId);

  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  // Leads that stopped retrying are never dropped silently — the user decides.
  if (isOnline && pendingCount === 0 && failedCount > 0) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={retryFailed}
          disabled={isSyncing}
          className="h-7 gap-1.5 border-destructive/40 bg-destructive/10 text-xs font-medium text-destructive hover:bg-destructive/20"
          title="These offline leads couldn't be saved. Retry sends them again."
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
          <span>{failedCount} not saved · Retry</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => {
            if (window.confirm(`Discard ${failedCount} unsaved lead${failedCount === 1 ? "" : "s"} from this device? This can't be undone.`)) discardFailed();
          }}
        >
          Discard
        </Button>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500"
        title="Offline mode active. Leads you add are safely saved to your device."
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
        </span>
        <WifiOff className="h-3 w-3" />
        <span>Offline{pendingCount > 0 ? ` (${pendingCount} queued)` : ""}</span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={syncNow}
      disabled={isSyncing}
      className="h-7 gap-1.5 border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-500 hover:bg-amber-500/20"
      title="Click to sync queued leads to your CRM"
    >
      <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
      <span>{isSyncing ? "Syncing..." : `Sync (${pendingCount})`}</span>
    </Button>
  );
}
