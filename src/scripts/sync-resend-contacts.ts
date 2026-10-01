// Pushes platform users (not tenants' leads — those never consented to Ridhzo mail) into Resend as
// contacts, with plan/org/role as properties for segmenting. Safe to re-run: existing contacts are updated.
// Usage: npm run sync:contacts   (needs RESEND_API_KEY; optional RESEND_SEGMENT_ID to also add to a segment)
import { upsertContact } from "@/lib/mail/contacts";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { organizations } from "@/db/schema/organizations";
import { PHONE_EMAIL_DOMAIN } from "@/lib/auth/googleLink";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const rows = await db
    .select({ email: users.email, firstName: users.firstName, lastName: users.lastName, optOut: users.emailOptOut, org: organizations.name, plan: organizations.plan, planStatus: organizations.planStatus })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(and(eq(users.isActive, true), isNull(users.deletedAt)));

  let ok = 0, skipped = 0, failed = 0;
  for (const u of rows) {
    if (!u.email || u.email.endsWith(PHONE_EMAIL_DOMAIN)) { skipped++; continue; } // no address (or a legacy placeholder)
    (await upsertContact({ ...u, email: u.email, unsubscribed: u.optOut.includes("newsletter") })) ? ok++ : failed++;
    await sleep(600); // Resend default limit is 2 req/s
  }
  console.log(`contacts synced=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed ? 1 : 0);
}
main();
