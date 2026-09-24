"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getLossReasonsAction, setLossReasonsAction } from "@/lib/actions/customStatuses";
import { useToast } from "@/hooks/use-toast";

// Workspace-specific "why was this lead lost" choices, one per line.
export function LossReasonsEditor() {
  const { toast } = useToast();
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getLossReasonsAction().then((r) => setText(r.join("\n"))).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await setLossReasonsAction(text.split("\n"));
      if (!res.ok) {
        toast({ variant: "destructive", title: "Reasons not saved", description: res.message });
        return;
      }
      setText(res.data.join("\n"));
      toast({ title: "Loss reasons saved" });
    } catch {
      toast({ variant: "destructive", title: "Reasons not saved", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Reasons a lead is lost</h3>
        <p className="text-xs text-muted-foreground">Shown when someone closes a lead as lost. One per line — “Other” is always included.</p>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="text-sm" />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save reasons"}
        </Button>
      </div>
    </div>
  );
}
