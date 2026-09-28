-- Digit-only phone search ("98765 43210" → "+919876543210") strips non-digits before matching. The
-- plain phone trigram index (0058) can't serve that expression, so it scanned the whole tenant.
-- Custom migration (not in the Drizzle schema): keep using db:migrate — db:push would drop it.
-- The expression must stay byte-identical to phoneDigitsSql in src/domains/leads/service.ts.
CREATE INDEX IF NOT EXISTS "leads_phone_digits_trgm_idx" ON "leads" USING gin ((regexp_replace("phone", '[^0-9]', '', 'g')) gin_trgm_ops);
