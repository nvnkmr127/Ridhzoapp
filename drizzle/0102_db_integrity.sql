-- Database integrity pass. Every step is idempotent and data-safe: where existing rows would violate a new
-- constraint the step is skipped with a NOTICE (fix the rows, re-run this file's statement) — it never fails the deploy.

-- 1) Lead email uniqueness is case-insensitive, matching the app's dedupe rule (A@x.com == a@x.com).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM leads WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> ''
    GROUP BY organization_id, lower(email) HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'leads_org_email_unique NOT rebuilt as lower(email): case-variant duplicate emails exist (SELECT organization_id, lower(email), count(*) FROM leads WHERE deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1)';
  ELSE
    DROP INDEX IF EXISTS "leads_org_email_unique";
    CREATE UNIQUE INDEX "leads_org_email_unique" ON "leads" ("organization_id", lower("email"))
      WHERE "deleted_at" IS NULL AND "email" IS NOT NULL AND "email" <> '';
  END IF;
END $$;--> statement-breakpoint

-- 2) One whatsapp_messages row per provider message id (webhook redeliveries can't double-record).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM whatsapp_messages WHERE provider_message_id IS NOT NULL GROUP BY provider_message_id HAVING count(*) > 1) THEN
    RAISE NOTICE 'wa_messages_provider_msg_unique NOT created: duplicate provider_message_id values exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "wa_messages_provider_msg_unique" ON "whatsapp_messages" ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;
  END IF;
END $$;--> statement-breakpoint

-- 3) The retention prune / pending sweeper filter webhook_events by status and age.
CREATE INDEX IF NOT EXISTS "webhook_events_status_created_idx" ON "webhook_events" ("status", "created_at");--> statement-breakpoint

-- 4) Child rows of a lead go with it. Every foreign key that points at leads(id) with NO ACTION is rebuilt:
--    CASCADE when the column is NOT NULL, SET NULL when it is nullable (e.g. a notification's deep link).
--    hardDeleteLeads still deletes explicitly (to remove stored files first); this is the safety net, so a
--    new child table can never block a lead purge or leave orphans. reminders already cascade from follow_ups.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col, a.attnotnull AS notnull
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.leads'::regclass AND c.confdeltype = 'a' AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.leads(id) ON DELETE %s',
                   r.tbl, r.conname, r.col, CASE WHEN r.notnull THEN 'CASCADE' ELSE 'SET NULL' END);
    RAISE NOTICE 'rebuilt %.% -> leads with ON DELETE %', r.tbl, r.col, CASE WHEN r.notnull THEN 'CASCADE' ELSE 'SET NULL' END;
  END LOOP;
END $$;
