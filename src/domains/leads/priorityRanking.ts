// Ranking for the dashboard's "Today's priorities". Pure, so it's testable without a database and
// so the ordering rules live in one place instead of inside a component's sort callback.
//
// Free by construction: this reads the plan the prewarm worker already wrote to the lead's
// `customData._aiRecap`. It never calls a model and never spends a credit. A lead with no cached
// plan — or one the rep dismissed, or one whose plan has gone stale — simply ranks on the rule
// signal alone, exactly as before.

export type AiSignal = "urgent" | "today" | "later" | null;

export interface CachedPlanLike {
  text: string;
  at: string;
  plan?: { next?: { id: string; urgency: string; confidence: string } | null } | null;
  dismissed?: string[];
}

/**
 * The AI's opinion of one lead, or null when it has none we should act on. Dismissed and stale
 * plans are treated as absent rather than as low confidence: a rep who swiped a suggestion away, or
 * a plan written before the lead moved, shouldn't have it resurface in their priority list.
 */
export function aiSignalFor(
  customData: unknown,
  now: number,
  staleAfterMs: number,
): { signal: AiSignal; reason: string | null } {
  const cached = (customData as { _aiRecap?: CachedPlanLike } | null | undefined)?._aiRecap;
  const next = cached?.plan?.next;
  if (!cached || !next) return { signal: null, reason: null };
  if (cached.dismissed?.includes(next.id)) return { signal: null, reason: null };
  const at = Date.parse(cached.at);
  if (!Number.isFinite(at) || now - at >= staleAfterMs) return { signal: null, reason: null };
  if (next.confidence === "low") return { signal: "later", reason: null }; // an unsure opinion never floats anything up
  const signal: AiSignal = next.urgency === "now" ? "urgent" : next.urgency === "today" ? "today" : "later";
  return { signal, reason: next.id };
}

const SIGNAL_RANK: Record<Exclude<AiSignal, null>, number> = { urgent: 0, today: 1, later: 2 };

export interface Rankable {
  id: string;
  /** A recent open of shared content — a real buying signal, and one the AI can't see. */
  isEngaged: boolean;
  score: number | null;
  ai: AiSignal;
}

/**
 * Orders the priorities panel. The AI leads when it has a fresh, confident, un-dismissed opinion;
 * a content open still beats a plain high score (someone literally just looked at your material);
 * score is the tiebreak, and id makes the result stable so the panel doesn't reshuffle on every
 * render when two leads are otherwise equal.
 */
export function rankByPriority<T extends Rankable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ai = (a.ai === null ? 3 : SIGNAL_RANK[a.ai]) - (b.ai === null ? 3 : SIGNAL_RANK[b.ai]);
    if (ai !== 0) return ai;
    if (a.isEngaged !== b.isEngaged) return a.isEngaged ? -1 : 1;
    const score = (b.score ?? 0) - (a.score ?? 0);
    return score !== 0 ? score : a.id.localeCompare(b.id);
  });
}