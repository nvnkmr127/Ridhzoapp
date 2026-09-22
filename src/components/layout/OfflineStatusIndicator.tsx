"use client";

import * as React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { Button } from "@/components/ui/button";

export function OfflineStatusIndicator({ organizationId }: { organizationId?: string } = {}) {
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineSync(organizationId);

  if (isOnline && pendingCount === 0) {
    return null;
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
