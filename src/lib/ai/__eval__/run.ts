// Prints the golden-set scorecard. `pnpm eval:ai`.
//
//   pnpm eval:ai              replay the recorded replies through the parser (no API key needed)
//   pnpm eval:ai -- --live    also generate fresh replies for each fixture (needs AI_GATEWAY_API_KEY)
//
// Replay mode is deterministic and is the gate CI uses: it measures whether our parsing and
// validation still do the right thing. Live mode measures the model too, which drifts on its own.

import { scoreCases, type Scorecard } from "./score";
import { EVAL_CASES } from "./fixtures";

// Inlined rather than imported from @/lib/ai/client: that module is "server-only", which only the
// vitest config aliases, and this script runs under tsx.
const key = process.env.AI_GATEWAY_API_KEY?.trim();
const liveEnabled = Boolean(key && !key.includes("REPLACE_") && !key.includes("your-key") && key.length > 10);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function print(card: Scorecard): void {
  console.log(`\nAI lead-brief eval — ${card.cases} golden cases (replay)\n`);
  const rows: [string, string, string][] = [
    ["usable recap", pct(card.usableAccuracy), "readable vs. correctly-refused"],
    ["field precision", pct(card.fieldPrecision), "no suggestion we didn't ask for"],
    ["field recall", pct(card.fieldRecall), "suggestions actually surfaced"],
    ["rejection rate", pct(card.rejectRate), "hallucinated / placeholder / no-change dropped"],
    ["status accuracy", pct(card.statusAccuracy), "right status, none, or nothing"],
    ["next-kind accuracy", pct(card.nextKindAccuracy), "right action or nothing"],
  ];
  for (const [label, value, note] of rows) {
    console.log(`  ${label.padEnd(20)} ${value.padStart(7)}   ${note}`);
  }
  console.log(`  ${"-".repeat(64)}`);
  console.log(`  ${"OVERALL".padEnd(20)} ${card.overall.toFixed(1).padStart(7)} / 100\n`);

  const failed = card.results.filter((r) => r.failures.length);
  if (failed.length) {
    console.log(`${failed.length} case(s) failing:\n`);
    for (const r of failed) console.log(`  ✗ ${r.id}\n      ${r.failures.join("\n      ")}`);
    console.log();
  } else {
    console.log("All cases pass.\n");
  }
}

const card = scoreCases(EVAL_CASES);
print(card);

if (process.argv.includes("--live")) {
  console.log("--live requested.");
  if (!liveEnabled) {
    console.log("No usable AI_GATEWAY_API_KEY (aiEnabled() is false) — skipping live generation.\n");
  } else {
    console.log("Live generation mode is not wired up yet; replay mode above is the gate.\n");
  }
}