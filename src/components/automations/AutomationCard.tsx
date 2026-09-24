"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Power, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toggleAutomation, deleteAutomation } from "@/lib/actions/automations";

export function AutomationCard({ id, name, isActive, overPlan = false }: { id: string; name: string; isActive: boolean; overPlan?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState(isActive);

  async function toggle() {
    setBusy(true);
    try {
      const res = await toggleAutomation(id, !active);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't update", description: res.message });
        return;
      }
      setActive(!active);
      toast({ title: !active ? "Automation activated" : "Automation paused" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't update", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete automation "${name}"?`)) return;
    setBusy(true);
    try {
      const res = await deleteAutomation(id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't delete", description: res.message });
        setBusy(false);
        return;
      }
      toast({ title: "Automation deleted" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't delete", description: "We couldn't reach the server. Please try again." });
      setBusy(false);
    }
  }

  return (
    <div className="border p-4 rounded-lg flex items-center justify-between">
      <div>
        <h3 className="font-medium">{name}</h3>
        <Badge variant={active && !overPlan ? "default" : "secondary"} className="mt-1 font-normal">
          {overPlan ? "Paused — over your plan limit" : active ? "Active" : "Inactive"}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={toggle} disabled={busy} className="gap-1.5">
          <Power className={`h-4 w-4 ${active ? "text-emerald-500" : "text-muted-foreground"}`} />
          {active ? "Pause" : "Activate"}
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Edit automation">
          <Link href={`/automations/${id}/edit`}><Pencil className="h-4 w-4" /></Link>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Delete automation" onClick={remove} disabled={busy}>
          <Trash2 className="h-4 w-4 text-white" />
        </Button>
      </div>
    </div>
  );
}
