// One-off: encrypt secrets still stored as plaintext (rows created before encryption existed):
//   • lead-source webhook secrets          (lead_sources.webhook_secret)
//   • Facebook Page access tokens          (lead_sources.config.pageAccessToken)
//   • Google Calendar OAuth tokens         (google_credentials.access_token / refresh_token)
// Safe to re-run — values already in the encrypted format are skipped. When it reports 0 remaining, set
// SECRETS_STRICT=1 so plaintext is no longer accepted.
// Usage: npm run encrypt:source-secrets
import { db } from "@/db";
import { leadSources } from "@/db/schema/leads";
import { googleCredentials } from "@/db/schema";
import { eq, isNotNull, sql } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";

// Already ciphertext we can read → leave alone.
const isEncrypted = (v: string) => decryptSecret(v) !== null;

async function main() {
  let done = 0;
  let total = 0;

  const sources = await db.select({ id: leadSources.id, s: leadSources.webhookSecret, config: leadSources.config }).from(leadSources);
  for (const r of sources) {
    if (r.s) {
      total++;
      if (!isEncrypted(r.s)) { await db.update(leadSources).set({ webhookSecret: encryptSecret(r.s) }).where(eq(leadSources.id, r.id)); done++; }
    }
    const tok = (r.config as { pageAccessToken?: string } | null)?.pageAccessToken;
    if (tok) {
      total++;
      if (!isEncrypted(tok)) {
        // jsonb merge in SQL, so no concurrent config edit is overwritten
        await db.update(leadSources).set({ config: sql`coalesce(${leadSources.config}, '{}'::jsonb) || ${JSON.stringify({ pageAccessToken: encryptSecret(tok) })}::jsonb` }).where(eq(leadSources.id, r.id));
        done++;
      }
    }
  }

  const creds = await db.select().from(googleCredentials).where(isNotNull(googleCredentials.accessToken));
  for (const c of creds) {
    const set: Record<string, string> = {};
    if (c.accessToken && !isEncrypted(c.accessToken)) set.accessToken = encryptSecret(c.accessToken);
    if (c.refreshToken && !isEncrypted(c.refreshToken)) set.refreshToken = encryptSecret(c.refreshToken);
    total += (c.accessToken ? 1 : 0) + (c.refreshToken ? 1 : 0);
    if (Object.keys(set).length) { await db.update(googleCredentials).set(set).where(eq(googleCredentials.userId, c.userId)); done += Object.keys(set).length; }
  }

  console.log(`Encrypted ${done} of ${total} stored secrets. ${done === 0 ? "Nothing left in plaintext — you can set SECRETS_STRICT=1." : "Re-run to confirm 0, then set SECRETS_STRICT=1."}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
