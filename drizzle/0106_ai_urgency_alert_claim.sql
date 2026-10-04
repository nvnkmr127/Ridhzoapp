-- Claim columns for the AI-urgency alert worker. `ai_urgency_alerted_at` is the idempotency claim
-- (handed back if the send fails); `ai_urgency_action_id` keeps a *new* urgent action alertable
-- once the cooldown lapses.
--
-- drizzle-kit re-emitted 0105's `users.push_opt_out` here because the snapshot chain is missing
-- 0104/0105; that statement has already run on every migrated database, so it's dropped.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ai_urgency_alerted_at" timestamp;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ai_urgency_action_id" varchar(64);