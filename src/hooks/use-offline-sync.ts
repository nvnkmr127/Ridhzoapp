"use client";

import * as React from "react";
import {
  getOfflineOutbox,
  flushOfflineOutbox,
  retryFailedOfflineLeads,
  discardFailedOfflineLeads,
  OFFLINE_OUTBOX_EVENT,
  OfflineLeadItem,
} from "@/lib/offline/outbox";
import { useToast } from "@/hooks/use-toast";

export function useOfflineSync(organizationId?: string) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = React.useState(true);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [failedCount, setFailedCount] = React.useState(0);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const refreshCount = React.useCallback(() => {
    const items = getOfflineOutbox(organizationId);
    setPendingCount(items.filter((i) => !i.failed).length);
    setFailedCount(items.filter((i) => i.failed).length);
  }, [organizationId]);

  const runSync = React.useCallback(async () => {
    if (typeof window === "undefined" || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await flushOfflineOutbox((lead: OfflineLeadItem) => {
        toast({
          title: "Offline lead synced ⚡",
          description: `${lead.payload.name} was successfully uploaded to your CRM.`,
        });
      }, organizationId);
      if (result.synced > 0) {
        toast({
          title: `All caught up!`,
          description: `Synced ${result.synced} offline lead${result.synced === 1 ? "" : "s"}.`,
        });
      }
      for (const dup of result.duplicates) {
        toast({
          variant: "destructive",
          title: `"${dup.name}" was a duplicate`,
          description: dup.message || "A lead with these details already exists — it was not added again.",
        });
      }
      if (result.gaveUp > 0) {
        toast({
          variant: "destructive",
          title: `${result.gaveUp} offline lead${result.gaveUp === 1 ? "" : "s"} couldn't be saved`,
          description: "They're kept on this device. Use Retry or Discard next to the sync status at the top.",
        });
      } else if (result.failed > 0) {
        const firstErr = result.items.find((i) => !i.success)?.error;
        toast({
          variant: "destructive",
          title: "Sync incomplete",
          description: firstErr || "Some offline leads could not be synced and will be retried.",
        });
      }
    } finally {
      setIsSyncing(false);
      refreshCount();
    }
  }, [toast, refreshCount, organizationId]);

  const retryFailed = React.useCallback(() => {
    retryFailedOfflineLeads(organizationId);
    void runSync();
  }, [organizationId, runSync]);

  const discardFailed = React.useCallback(() => {
    discardFailedOfflineLeads(organizationId);
    refreshCount();
  }, [organizationId, refreshCount]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);
    refreshCount();
    // Leads queued before a reload/restart shouldn't wait for the next "online" event or a click.
    if (navigator.onLine && getOfflineOutbox(organizationId).some((i) => !i.failed)) void runSync();

    const handleOnline = () => {
      setIsOnline(true);
      void runSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleOutboxChange = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail?.organizationId || !organizationId || detail.organizationId === organizationId) {
        refreshCount();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OFFLINE_OUTBOX_EVENT, handleOutboxChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_OUTBOX_EVENT, handleOutboxChange);
    };
  }, [runSync, refreshCount, organizationId]);

  return {
    isOnline,
    pendingCount,
    failedCount,
    isSyncing,
    syncNow: runSync,
    retryFailed,
    discardFailed,
  };
}
