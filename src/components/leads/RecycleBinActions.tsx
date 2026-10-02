"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { restoreLeadAction, purgeLeadAction, emptyRecycleBinAction } from "@/lib/actions/leads";

export function RecycleBinRowActions({ leadId, canPurge }: { leadId: string; canPurge: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function restore() {
    setBusy(true);
    try {
      const res = await restoreLeadAction(leadId);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't restore", description: res.message });
        return;
      }
      toast({ title: "Lead restored" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't restore", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    } finally {
      setBusy(false);
    }
  }

  async function purge() {
    if (!confirm("Permanently delete this lead? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await purgeLeadAction(leadId);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't delete",
          description: res.code === "FORBIDDEN" ? "Only an admin can permanently delete." : res.message,
        });
        return;
      }
      toast({ title: "Lead permanently deleted" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't delete", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={restore} disabled={busy}>
        <RotateCcw className="h-4 w-4" /> Restore
      </Button>
      {canPurge && (
        <Button variant="ghost" size="sm" onClick={purge} disabled={busy} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
    </div>
  );
}

export function EmptyBinButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function empty() {
    if (!confirm("Permanently delete ALL leads in the recycle bin? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await emptyRecycleBinAction();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Couldn't empty bin",
          description: res.code === "FORBIDDEN" ? "Only an admin can empty the recycle bin." : res.message,
        });
        return;
      }
      const { purgedCount } = res.data;
      toast({ title: `Emptied recycle bin`, description: `${purgedCount} lead${purgedCount === 1 ? "" : "s"} permanently deleted.` });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't empty bin", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={empty} disabled={busy}>
      <Trash2 className="h-4 w-4" /> Empty recycle bin
    </Button>
  );
}
