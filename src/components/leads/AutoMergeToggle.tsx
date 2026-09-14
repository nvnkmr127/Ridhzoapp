"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { setAutoMergeAction } from "@/lib/actions/dedup";

export function AutoMergeToggle({ initial }: { initial: boolean }) {
  const { toast } = useToast();
  const [on, setOn] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function change(next: boolean) {
    setOn(next);
    setSaving(true);
    try {
      const res = await setAutoMergeAction(next);
      if (!res.ok) {
        setOn(!next);
        toast({ variant: "destructive", title: "Couldn't update setting", description: res.message });
      } else {
        toast({ title: next ? "Auto-merge enabled" : "Auto-merge disabled" });
      }
    } catch {
      setOn(!next);
      toast({ variant: "destructive", title: "Couldn't update setting", description: "We couldn't reach the server." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Auto-merge duplicates on arrival</p>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
          When a new lead shares an email or phone with an existing one, merge it into the existing lead
          automatically — the older record is kept and the new details fill any blanks.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm shrink-0">
        <input type="checkbox" className="h-4 w-4 rounded border-input" checked={on} disabled={saving} onChange={(e) => change(e.target.checked)} />
        {on ? "On" : "Off"}
      </label>
    </div>
  );
}
