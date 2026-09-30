// One-off: encrypt lead-source webhook secrets still stored as plaintext (rows created before
// encryption). Safe to re-run — already-encrypted values (they contain ".") are skipped.
// Usage: npm run encrypt:source-secrets
import { db } from "@/db";
import { leadSources } from "@/db/schema/leads";
import { eq, isNotNull } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto/secret";

async function main() {
  const rows = await db.select({ id: leadSources.id, s: leadSources.webhookSecret }).from(leadSources).where(isNotNull(leadSources.webhookSecret));
  let n = 0;
  for (const r of rows) {
    if (!r.s || r.s.includes(".")) continue;
    await db.update(leadSources).set({ webhookSecret: encryptSecret(r.s) }).where(eq(leadSources.id, r.id));
    n++;
  }
  console.log(`Encrypted ${n} of ${rows.length} source secrets.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
