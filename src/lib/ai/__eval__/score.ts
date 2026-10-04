// Scores the golden set: replays each recorded model reply through the real parser and measures
// whether the validator did the right thing. Pure — no DB, no network — so it runs in CI.

import { parseLeadBrief, type LeadPlan } from "@/lib/ai/leadPlan";
import { EVAL_CASES, type EvalCase } from "./fixtures";

export interface CaseResult {
  id: string;
  usable: boolean;
  fieldKeys: string[];
  statusKey: string | null;
  nextKind: string | null;
  failures: string[];
}

export interface Scorecard {
  cases: number;
  /** Fraction of cases that produced the expected usable/unusable outcome. */
  usableAccuracy: number;
  /** Of the field suggestions produced, the share that were expected. 1 = nothing spurious. */
  fieldPrecision: number;
  /** Of the expected field suggestions, the share that were found. */
  fieldRecall: number;
  /** Of the field keys the model offered that must be dropped, the share actually dropped. */
  rejectRate: number;
  statusAccuracy: number;
  nextKindAccuracy: number;
  /** 0-100 mean of the above; the single number the baseline test guards. */
  overall: number;
  results: CaseResult[];
}

const ratio = (hit: number, total: number) => (total === 0 ? 1 : hit / total);

function runCase(c: EvalCase): CaseResult {
  const failures: string[] = [];
  // Replay in order: the harness models the caller retrying once when the first reply has no JSON,
  // exactly as recapForLead does, and scores whichever reply the parser actually accepted.
  let parsed: { recap: string; plan: LeadPlan } | null = null;
  for (const reply of c.replies) {
    const r = parseLeadBrief(reply, c.input);
    if (r.recap && !r.recap.startsWith("Couldn't read the AI's summary")) {
      parsed = r;
      break;
    }
    parsed = r; // keep the last attempt so an all-fail case still reports its outcome
  }
  const plan = parsed?.plan ?? { fields: [], status: null, next: null };
  const usable = !!parsed?.recap && !parsed.recap.startsWith("Couldn't read the AI's summary") && parsed.recap.length <= 600;
  const fieldKeys = plan.fields.map((f) => f.key);
  const statusKey = plan.status?.key ?? null;
  const nextKind = plan.next?.kind ?? null;

  if (c.expect.usable !== undefined && usable !== c.expect.usable) {
    failures.push(`usable: expected ${c.expect.usable}, got ${usable}`);
  }
  for (const key of c.expect.fieldKeys ?? []) {
    if (!fieldKeys.includes(key)) failures.push(`missing expected field "${key}"`);
  }
  for (const key of c.expect.dropFieldKeys ?? []) {
    if (fieldKeys.includes(key)) failures.push(`kept forbidden field "${key}"`);
  }
  if (c.expect.statusKey !== undefined && statusKey !== c.expect.statusKey) {
    failures.push(`status: expected ${c.expect.statusKey}, got ${statusKey}`);
  }
  if (c.expect.nextKind !== undefined && nextKind !== c.expect.nextKind) {
    failures.push(`next.kind: expected ${c.expect.nextKind}, got ${nextKind}`);
  }

  return { id: c.id, usable, fieldKeys, statusKey, nextKind, failures };
}

export function scoreCases(cases: EvalCase[] = EVAL_CASES): Scorecard {
  const results = cases.map(runCase);

  const expectedFields = cases.flatMap((c) => c.expect.fieldKeys ?? []);
  const producedFields = results.flatMap((r, i) => r.fieldKeys.map((k) => ({ k, i })));
  const expectedSet = new Map(cases.map((c, i) => [c.id, new Set(c.expect.fieldKeys ?? [])]));

  // Precision counts a produced key against the case it came from, so cross-case matching can't
  // accidentally hide a spurious suggestion that happens to be expected elsewhere.
  const goodProduced = producedFields.filter(({ k, i }) => expectedSet.get(cases[i].id)?.has(k)).length;
  const forbidden = cases.flatMap((c) => c.expect.dropFieldKeys ?? []);
  const keptForbidden = cases.reduce(
    (n, c, i) => n + (c.expect.dropFieldKeys ?? []).filter((k) => results[i].fieldKeys.includes(k)).length,
    0,
  );

  const usableHits = results.filter((r, i) => cases[i].expect.usable === undefined || r.usable === cases[i].expect.usable).length;
  const statusCases = cases.map((c, i) => ({ c, r: results[i] })).filter((x) => x.c.expect.statusKey !== undefined);
  const nextCases = cases.map((c, i) => ({ c, r: results[i] })).filter((x) => x.c.expect.nextKind !== undefined);

  const usableAccuracy = ratio(usableHits, results.length);
  const fieldPrecision = ratio(goodProduced, producedFields.length);
  const fieldRecall = ratio(goodProduced, expectedFields.length);
  const rejectRate = ratio(forbidden.length - keptForbidden, forbidden.length);
  const statusAccuracy = ratio(statusCases.filter((x) => x.r.statusKey === x.c.expect.statusKey).length, statusCases.length);
  const nextKindAccuracy = ratio(nextCases.filter((x) => x.r.nextKind === x.c.expect.nextKind).length, nextCases.length);

  // Weighted toward rejection: a validator that invents suggestions is worse than one that misses
  // them, because a wrong suggestion is something a rep acts on.
  const overall =
    100 *
    (0.2 * usableAccuracy +
      0.3 * fieldPrecision +
      0.15 * fieldRecall +
      0.2 * rejectRate +
      0.075 * statusAccuracy +
      0.075 * nextKindAccuracy);

  return {
    cases: results.length,
    usableAccuracy,
    fieldPrecision,
    fieldRecall,
    rejectRate,
    statusAccuracy,
    nextKindAccuracy,
    overall,
    results,
  };
}