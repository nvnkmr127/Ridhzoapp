// One place for "how quiet has this lead gone?".
//
// These were four unrelated magic numbers — 5 in the NBA, 14 in stale-lead reclamation, 14 in the
// re-engagement cadence, 7/14 in engagement velocity — chosen at different times by different code.
// They disagreed in ways a rep could see: the NBA started calling a lead "going cold" on day 6 while
// the reclamation job still counted it healthy for another eight, and the AI, which inherits all of
// them, would happily narrate both at once.
//
// The rungs are deliberately different values, because they answer different questions: nudging a
// rep is a low bar, reclaiming a lead is a high one. What they share is the ladder, so a rung can be
// read against its neighbours instead of guessed at — and so changing the ladder is one edit, not a
// hunt through four files.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** First rung: no contact for this long and the rep should hear about it. */
export const GOING_COLD_DAYS = 5;
/** Second rung: silence has lasted long enough to start a re-engagement cadence. */
export const REENGAGE_AFTER_DAYS = 14;
/** Third rung: presumed lost — returned to the shared pool for someone else to work. */
export const STALE_AFTER_DAYS = 14;

/**
 * Measurement windows, not triggers: engagement velocity compares the last week against the week
 * before it to tell acceleration from decay.
 */
export const VELOCITY_RECENT_DAYS = 7;
export const VELOCITY_PREVIOUS_DAYS = 14;

/** Whole days since `at`, or Infinity when there's no date. Infinity sorts correctly in comparisons. */
export function daysSince(at: Date | string | null | undefined, now: Date = new Date()): number {
  if (!at) return Infinity;
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / DAY_MS;
}

export type InactivityTier = "active" | "cooling" | "stale";

/**
 * The one word for how quiet a lead has gone, so the engagement card, the NBA and the AI's reason
 * can't describe the same lead three different ways.
 *
 * There is deliberately no fourth tier between `cooling` and `stale`. Re-engagement and reclamation
 * both begin on day 14, so a day-14 lead is genuinely in one state, not two — and inventing a rung
 * between them would mean picking a reclamation threshold, which reassigns leads and is a product
 * decision rather than a refactor.
 */
export function inactivityTier(days: number): InactivityTier {
  if (days >= STALE_AFTER_DAYS) return "stale";
  if (days >= GOING_COLD_DAYS) return "cooling";
  return "active";
}