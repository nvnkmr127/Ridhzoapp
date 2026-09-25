import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { EnrichmentService, needsEnrichment } from "@/domains/leads/enrichmentService";
import { ScoringService } from "@/domains/leads/scoringService";

// One-off backfill for leads created before enrichment existed. Enrichment only fires on
// lead.created, so existing leads never get looked up — this walks them once. Each lead is
// enriched using its own tenant's configured provider (Settings → Lead Intelligence); leads whose
// org has no provider are skipped. Scope with --org to a single tenant.
//   npx tsx -r dotenv/config src/scripts/backfill-enrichment.ts [--org <id>] [--limit N] [--scores]
// --scores also recomputes engagement scores so the "why this score" breakdown populates now
// (otherwise it fills in on the next daily score run).
async function main() {
  const orgArg = process.argv.indexOf("--org");
  const orgId = orgArg !== -1 ? process.argv[orgArg + 1] : undefined;
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : undefined;
  const doScores = process.argv.includes("--scores");

  if (doScores) {
    console.log("Recomputing scores…");
    const n = await ScoringService.recalculateAllScores(orgId);
    console.log(`  scored ${n} leads`);
  }

  const rows = await db
    .select({ id: leads.id, email: leads.email, company: leads.company, customData: leads.customData })
    .from(leads)
    .where(orgId ? eq(leads.organizationId, orgId) : undefined);

  const candidates = rows.filter(needsEnrichment).slice(0, limit ?? rows.length);
  console.log(`Enriching ${candidates.length} of ${rows.length} leads…`);

  let enriched = 0;
  let skipped = 0;
  for (const lead of candidates) {
    // enrichLead throws on transient provider errors (so the queue retries); here, count and move on.
    const res = await EnrichmentService.enrichLead(lead.id).catch(() => ({ status: "skipped" as const }));
    if (res.status === "enriched") enriched++;
    else skipped++;
  }

  console.log(`Done. enriched=${enriched} skipped=${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
