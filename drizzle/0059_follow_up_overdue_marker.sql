ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "overdue_notified_at" timestamp;--> statement-breakpoint
-- Follow-ups already overdue at deploy count as alerted, so the first scan doesn't flood anyone.
UPDATE "follow_ups" SET "overdue_notified_at" = (now() at time zone 'utc') WHERE "status" = 'pending' AND "due_at" < (now() at time zone 'utc');
