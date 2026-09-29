import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PHONE_EMAIL_DOMAIN } from "@/lib/auth/googleLink";

// Password sign-in accepts an email OR a phone number (team members an admin added by number have no
// real email). A number matches on its last 10 digits — however it was typed or saved — and only when
// exactly one account has it, so a shared number can never sign you into someone else's account.
export async function findLoginUser(identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (id.includes("@")) {
    const [u] = await db.select().from(users).where(and(eq(users.email, id), isNull(users.deletedAt))).limit(1);
    return u;
  }
  const digits = id.replace(/\D/g, "");
  if (digits.length < 7) return undefined;
  const last = digits.slice(-10);
  const rows = await db
    .select()
    .from(users)
    .where(and(isNull(users.deletedAt), or(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${last}`, like(users.email, `%${last}${PHONE_EMAIL_DOMAIN}`))))
    .limit(2);
  return rows.length === 1 ? rows[0] : undefined;
}
