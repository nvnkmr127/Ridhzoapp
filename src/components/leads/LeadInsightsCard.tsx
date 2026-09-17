import { Gauge } from "lucide-react";
import { SectionCard } from "./SectionCard";

// Server-rendered "why" for a lead: the score broken into its contributing factors (#3) and any
// provider enrichment as observed evidence (#1). Reads straight from customData — no AI call, no
// client state. Renders nothing when there's neither, so it never shows an empty card.

interface ScoreFactor {
  label: string;
  points: number;
}

export function LeadInsightsCard({ score, customData }: { score: number | null; customData: unknown }) {
  const data = (customData as Record<string, unknown> | null) ?? {};
  const sf = data._scoreFactors as { factors?: ScoreFactor[] } | undefined;
  const factors = Array.isArray(sf?.factors) ? sf!.factors! : [];
  const enrichment = data._enrichment as
    | { source?: string; attributes?: Record<string, unknown> }
    | undefined;
  const attrs = enrichment?.attributes ?? {};
  const attrEntries = Object.entries(attrs).filter(([k]) => k !== "company" && k !== "companyName");

  const hasScore = score != null;
  if (!hasScore && factors.length === 0 && attrEntries.length === 0) return null;

  return (
    <SectionCard icon={Gauge} title="Why this score">
      <div className="space-y-4">
        {(hasScore || factors.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{score ?? 0}</span>
              <span className="text-xs text-muted-foreground">/ 100 engagement</span>
            </div>
            {factors.length > 0 ? (
              <ul className="space-y-1.5">
                {factors.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{f.points}
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
        )}

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
