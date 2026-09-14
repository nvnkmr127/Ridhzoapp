"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { deleteSequenceAction, setSequenceActiveAction } from "@/lib/actions/sequences";

export function SequenceRowActions({ id, name, isActive = true }: { id: string; name: string; isActive?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState(isActive);

  async function toggle() {
    const next = !active;
    setActive(next);
    try {
      const res = await setSequenceActiveAction(id, next);
      if (!res.ok) {
        setActive(!next);
        toast({ variant: "destructive", title: "Couldn't update", description: res.message });
      } else {
        toast({ title: next ? "Sequence resumed" : "Sequence paused", description: next ? undefined : "No new steps will send while paused." });
      }
    } catch {
      setActive(!next);
      toast({ variant: "destructive", title: "Couldn't update", description: "We couldn't reach the server." });
    }
  }

  async function remove() {
    if (!confirm(`Delete sequence "${name}"? Active enrollments will stop.`)) return;
    setBusy(true);
    try {
      const res = await deleteSequenceAction(id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't delete", description: res.message });
        setBusy(false);
        return;
      }
      toast({ title: "Sequence deleted" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't delete", description: "We couldn't reach the server. Please try again." });
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label={active ? "Pause sequence" : "Resume sequence"} onClick={toggle}>
        {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button asChild variant="ghost" size="icon" aria-label="Edit sequence">
        <Link href={`/sequences/${id}/edit`}><Pencil className="h-4 w-4" /></Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete sequence" onClick={remove} disabled={busy} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
