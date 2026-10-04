-- Claim columns for the AI-urgency alert worker. `ai_urgency_alerted_at` is the idempotency claim
-- (handed back if the send fails); `ai_urgency_action_id` keeps a *new* urgent action alertable
-- once the cooldown lapses.
--
-- drizzle-kit re-emitted 0105's `users.push_opt_out` here because the snapshot chain is missing
-- 0104/0105; that statement has already run on every migrated database, so it's dropped.
--
-- NOTE ON THE JOURNAL TIMESTAMP: this migration's `when` in meta/_journal.json is 1791700000001,
-- not the Date.now() drizzle-kit generated. That is deliberate. `db:migrate` applies a migration only
-- when the newest row in `drizzle.__drizzle_migrations` has a smaller `created_at`
-- (drizzle-orm/pg-core/dialect.js). Rows 0-102 in the seeded database were stamped with round values
-- that run ~7 days into the future, so `ORDER BY created_at DESC` returns row 102 (1791700000000)
-- and drizzle silently skips every migration generated before that date -- `db:migrate` exits 0 and
-- applies nothing. 0103-0105 are genuinely applied on that database and are correctly skipped; this
-- one had to be pushed past the bogus high-water mark to run. The underlying bad timestamps still
-- need repairing in `drizzle.__drizzle_migrations`, or the next generated migration is skipped too.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ai_urgency_alerted_at" timestamp;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ai_urgency_action_id" varchar(64);