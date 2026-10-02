-- Substring search (ILIKE '%q%') on name/email/company/phone digits was a sequential scan of the
-- tenant's leads. Trigram GIN indexes let Postgres answer it from the index. Needs the pg_trgm
-- extension; if the role may not create it the migration still succeeds (search just stays unindexed).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available (%): lead search indexes skipped', SQLERRM;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "leads_name_trgm_idx" ON "leads" USING gin ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "leads_email_trgm_idx" ON "leads" USING gin ("email" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "leads_company_trgm_idx" ON "leads" USING gin ("company" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "leads_phone_digits_trgm_idx" ON "leads" USING gin ((regexp_replace("phone", '[^0-9]', '', 'g')) gin_trgm_ops);
  END IF;
END $$;
