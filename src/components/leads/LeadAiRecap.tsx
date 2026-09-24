"use client";

import * as React from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { summarizeLeadAction } from "@/lib/actions/ai";

type Recap = { text: string; at?: string };

function ago(iso?: string) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// "Where does this lead stand" recap. Shows the saved recap instantly (no AI call); the server reuses
// it until the lead changes. Runs automatically once for a brand-new lead that has form answers —
// the moment a recap of "what they asked for" helps most — otherwise only on demand.
export function LeadAiRecap({ leadId, initial, autoRun = false }: { leadId: string; initial?: Recap | null; autoRun?: boolean }) {
  const [recap, setRecap] = React.useState<Recap | null>(initial ?? null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await summarizeLeadAction({ leadId, refresh });
        setRecap({ text: res.summary, at: res.generatedAt });
      } catch {
        setError("Couldn't generate a recap right now. Try again in a moment.");
      } finally {
        setLoading(false);
      }
    },
    [leadId],
  );

  React.useEffect(() => {
    if (autoRun && !initial) run();
  }, [autoRun, initial, run]);

  if (recap) {
    return (
      <div className="space-y-1.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
          <p className="text-foreground/90">{loading ? "Updating…" : recap.text}</p>
        </div>
        <div className="flex items-center justify-between pl-6 text-[11px] text-muted-foreground">
          <span>{recap.at ? `AI recap · ${ago(recap.at)}` : "Recap"}</span>
          <button type="button" onClick={() => run(true)} disabled={loading} className="flex items-center gap-1 hover:text-foreground disabled:opacity-50">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button variant="outline" size="sm" onClick={() => run()} disabled={loading} className="gap-2">
        <Sparkles className="h-4 w-4" />
        {loading ? "Summarizing…" : "AI recap"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
