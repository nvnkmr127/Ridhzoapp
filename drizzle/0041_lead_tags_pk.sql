-- Collapse any pre-existing duplicate (lead_id, tag_id) rows down to one, keeping the earliest,
-- so the primary key can be added. lead_tags has no surrogate key, so dedupe on the physical ctid.
DELETE FROM "lead_tags"
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM "lead_tags" GROUP BY "lead_id", "tag_id"
);--> statement-breakpoint
DROP INDEX IF EXISTS "lead_tags_pk";--> statement-breakpoint
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_tag_id_pk" PRIMARY KEY("lead_id","tag_id");
