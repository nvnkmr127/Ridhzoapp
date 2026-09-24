-- Trigram indexes so "contains" lead search (ILIKE '%term%') on name/email/phone/company uses an
-- index instead of scanning every lead. Custom migration (not in the Drizzle schema): keep using
-- db:migrate — db:push would drop these.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_name_trgm_idx" ON "leads" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_email_trgm_idx" ON "leads" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_phone_trgm_idx" ON "leads" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_company_trgm_idx" ON "leads" USING gin ("company" gin_trgm_ops);
