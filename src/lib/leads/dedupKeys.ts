import { sql, type SQL } from "drizzle-orm";
import { leads } from "@/db/schema";

// THE rule for "same person" — used by every duplicate check (manual/API create, ad & form
// ingestion, CSV import, public booking, auto-merge, the lead-page banner and the review screen).
//   Email: trimmed, case-insensitive.
//   Phone: digits only; 10+ digits compare on the LAST 10 (so "+91 98765 43210", "919876543210" and
//   "9876543210" are one number); 7–9 digits must match exactly; fewer is too short to trust.
// ponytail: last-10 can join two countries' numbers that share their last 10 digits — negligible
// inside one workspace; key on the full E.164 number if a tenant spans many countries.

export const MIN_PHONE_DIGITS = 7;

export function emailKey(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

export function phoneKey(phone?: string | null): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < MIN_PHONE_DIGITS) return "";
  return d.length >= 10 ? d.slice(-10) : d;
}

export function sameLead(a: { email?: string | null; phone?: string | null }, b: { email?: string | null; phone?: string | null }) {
  const ea = emailKey(a.email);
  const pa = phoneKey(a.phone);
  return { email: !!ea && ea === emailKey(b.email), phone: !!pa && pa === phoneKey(b.phone) };
}

// Must stay byte-identical to the expression of leads_phone_digits_trgm_idx (drizzle/0081) so the
// suffix LIKE below can use that index.
const phoneDigits = sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g')`;

// SQL: this phone matches the stored lead phone under the rule above.
export function phoneMatchSql(phone?: string | null): SQL | null {
  const key = phoneKey(phone);
  if (!key) return null;
  if (key.length === 10) return sql`${phoneDigits} like ${"%" + key}`;
  return sql`${phoneDigits} = ${key}`;
}

// SQL: stored email equals this one, ignoring case.
export function emailMatchSql(email?: string | null): SQL | null {
  const key = emailKey(email);
  return key ? sql`lower(trim(${leads.email})) = ${key}` : null;
}

// Both conditions that apply (OR them), or [] when there's nothing to match on.
export function dedupConditions(input: { email?: string | null; phone?: string | null }): SQL[] {
  return [emailMatchSql(input.email), phoneMatchSql(input.phone)].filter((c): c is SQL => !!c);
}

// Raw SQL key expressions for grouping (the review screen), same rule as phoneKey/emailKey.
export const emailKeySql = sql`lower(trim(email))`;
export const phoneKeySql = sql`(case when length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
  then right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
  when length(regexp_replace(phone, '[^0-9]', '', 'g')) >= ${MIN_PHONE_DIGITS}
  then regexp_replace(phone, '[^0-9]', '', 'g') end)`;

// Name key for "same name" suggestions: lower-case, single spaces, and at least two words — a lone
// first name ("Ravi") matches far too many different people to be worth suggesting.
export function nameKey(name?: string | null): string {
  const n = (name ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
  return n.split(" ").length >= 2 ? n : "";
}
