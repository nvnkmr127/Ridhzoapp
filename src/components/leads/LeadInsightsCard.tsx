import { Gauge } from "lucide-react";
import { SectionCard } from "./SectionCard";
import { ScoringService, ScoreFactor, LeadScoreInput } from "@/domains/leads/scoringService";

export interface LeadInsightsCardProps {
  score: number | null;
  customData: unknown;
  leadInfo?: LeadScoreInput;
}

export function LeadInsightsCard({ score, customData, leadInfo }: LeadInsightsCardProps) {
  const data = (customData as Record<string, unknown> | null) ?? {};
  const sf = data._scoreFactors as { score?: number; factors?: ScoreFactor[] } | undefined;
  
  let factors = Array.isArray(sf?.factors) ? sf!.factors! : [];
  let displayScore = sf?.score ?? score ?? 0;

  // Prefer a live breakdown from current data — the saved one can be stale (or from an older
  // scoring model) until the next recalculation.
  if (leadInfo) {
    const computed = ScoringService.breakdown(leadInfo);
    displayScore = computed.score;
    factors = computed.factors;
  }

  const enrichment = data._enrichment as
    | { source?: string; attributes?: Record<string, unknown> }
    | undefined;
  const attrs = enrichment?.attributes ?? {};
  const attrEntries = Object.entries(attrs).filter(([k]) => k !== "company" && k !== "companyName");

  if (displayScore === 0 && factors.length === 0 && attrEntries.length === 0) return null;

  return (
    <SectionCard icon={Gauge} title="Lead score" description="How interested this lead looks, and why.">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{displayScore}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
            {/* A bare number meant nothing to reps — say what it means. */}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                displayScore >= 60
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : displayScore >= 30
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
              }`}
            >
              {displayScore >= 60 ? "Hot" : displayScore >= 30 ? "Warm" : "Cold"}
            </span>
          </div>
          {factors.length > 0 ? (
            <ul className="space-y-1.5">
              {factors.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className={`font-medium tabular-nums ${f.points < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {f.points > 0 ? "+" : ""}{f.points}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Score based on lead profile completeness and recency.
            </p>
          )}
        </div>

        {attrEntries.length > 0 && (
          <div className="border-t pt-3 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Enriched{enrichment?.source ? ` · observed by ${enrichment.source}` : ""}
            </p>
            <dl className="space-y-1">
              {attrEntries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground capitalize">{k}</dt>
                  <dd className="font-medium text-right truncate max-w-[60%]">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
