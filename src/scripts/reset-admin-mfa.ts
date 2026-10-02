import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Lost authenticator? Clear a platform operator's TOTP so they can enrol a new one at /admin.
//   npm run admin:reset-mfa -- you@example.com
async function main() {
  const email = process.argv[2];
  if (!email) { console.error("Usage: npm run admin:reset-mfa -- <email>"); process.exit(1); }
  const [u] = await db.update(users).set({ totpSecret: null, totpEnabledAt: null, updatedAt: new Date() }).where(eq(users.email, email)).returning({ email: users.email });
  console.log(u ? `Cleared two-factor for ${u.email}` : `No user found with email ${email}`);
  process.exit(u ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
