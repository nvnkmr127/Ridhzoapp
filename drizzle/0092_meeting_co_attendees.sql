-- Extra attendees on a meeting (the assignee stays the main one).
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "co_attendee_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
