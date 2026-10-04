"use client";

import * as React from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { summarizeLeadAction } from "@/lib/actions/ai";
import { recapIsStale } from "@/lib/ai/recapCache";
import { usePlan } from "@/components/billing/PlanGate";
import { AiLeadSuggestions } from "@/components/leads/AiLeadSuggestions";
import type { LeadPlan } from "@/lib/ai/leadPlan";

/**
 * `stale` / `cached` / `pending` are the server's own words about how much to trust this recap.
 * They used to be computed and thrown away here, which is how a rep ended up reading advice
 * written before the conversation they were looking at.
 */
type Recap = { text: string; at?: string; plan?: LeadPlan; ai?: boolean; stale?: boolean; cached?: boolean; pending?: boolean };

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
// `changeKey` (the lead's live change token) moves when the lead gets new activity; an existing recap
// then refreshes itself so it never describes a lead that has moved on. The server only spends a
// credit when the recap's inputs actually changed — otherwise it hands back the saved one.
export function LeadAiRecap({
  leadId,
  initial,
  autoRun = false,
  changeKey,
}: {
  leadId: string;
  initial?: Recap | null;
  autoRun?: boolean;
  changeKey?: string | null;
}) {
  const [recap, setRecap] = React.useState<Recap | null>(initial ?? null);
  // No saved recap and nothing generated yet — the button costs a credit, so say so before it's pressed.
  const pending = !recap?.text;

  // A newer recap arrived with the page data (e.g. generated on another device) — show it.
  React.useEffect(() => {
    if (initial?.text && initial.at && (!recap?.at || initial.at > recap.at)) setRecap(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.text, initial?.at]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { paid, openUpgrade } = usePlan();

  // `auto` = the on-open run for a fresh lead; out of credits there stays quiet (no popup on page load).
  const run = React.useCallback(
    async (refresh = false, auto = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await summarizeLeadAction({ leadId, refresh });
        if (res.outOfCredits) {
          if (!auto) openUpgrade();
          return;
        }
        setRecap({ text: res.summary, at: res.generatedAt, plan: res.plan, ai: res.ai, stale: res.stale, cached: res.cached, pending: res.pending });
      } catch {
        setError("Couldn't generate a recap right now. Try again in a moment.");
      } finally {
        setLoading(false);
      }
    },
    [leadId, openUpgrade],
  );

  // Auto-generate on open: if no recap yet, or if existing recap is older than 3 hours (e.g. morning open).
  const ranOnMount = React.useRef(false);
  React.useEffect(() => {
    if (ranOnMount.current || !paid) return;
    const isStale = recapIsStale(initial?.at);
    if (!initial || isStale || autoRun) {
      ranOnMount.current = true;
      run(isStale && !!initial, true);
    }
  }, [autoRun, initial, paid, run]);

  // Lead changed while open: refresh a recap that's already showing (paid workspaces only, quietly).
  const lastKey = React.useRef(changeKey);
  React.useEffect(() => {
    if (changeKey == null || changeKey === lastKey.current) return;
    lastKey.current = changeKey;
    if (recap && paid && !loading) run(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeKey]);

  if (recap) {
    return (
      <div className="space-y-1.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-sm">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
          <p className="text-foreground/90">{loading ? "Updating…" : recap.text}</p>
        </div>
        {!loading && recap.plan && (
          <AiLeadSuggestions leadId={leadId} plan={recap.plan} onChange={(plan) => setRecap((r) => (r ? { ...r, plan } : r))} />
        )}
        <div className="flex items-center justify-between pl-6 text-[11px] text-muted-foreground">
          <span>
            {recap.stale
              ? "Out of date — the lead has moved since this was written"
              : recap.ai === false
                ? "Basic summary — AI couldn't run, tap Refresh"
                : recap.at
                  ? `AI recap · ${ago(recap.at)}`
                  : "Recap"}
          </span>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={loading}
            className={`flex items-center gap-1 disabled:opacity-50 ${recap.stale ? "font-medium text-foreground" : "hover:text-foreground"}`}
          >
            <RefreshCw className="h-3 w-3" /> {recap.stale ? "Refresh" : loading ? "Refreshing…" : "Refresh"}
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
      {pending && !paid && <p className="text-xs text-muted-foreground">AI recap uses one of your monthly credits.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
