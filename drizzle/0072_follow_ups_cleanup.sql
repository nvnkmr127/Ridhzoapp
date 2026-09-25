ALTER TABLE "reminders" DROP CONSTRAINT "reminders_follow_up_id_follow_ups_id_fk";
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_follow_up_id_follow_ups_id_fk" FOREIGN KEY ("follow_up_id") REFERENCES "public"."follow_ups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- One vocabulary for follow-up types (see src/lib/followUps/types.ts): call, whatsapp, email, task, followup.
UPDATE "follow_ups" SET "type" = CASE
  WHEN lower(regexp_replace("type", '[^a-zA-Z]', '', 'g')) IN ('call', 'phone', 'phonecall') THEN 'call'
  WHEN lower(regexp_replace("type", '[^a-zA-Z]', '', 'g')) IN ('whatsapp', 'wa') THEN 'whatsapp'
  WHEN lower(regexp_replace("type", '[^a-zA-Z]', '', 'g')) IN ('email', 'mail') THEN 'email'
  WHEN lower(regexp_replace("type", '[^a-zA-Z]', '', 'g')) IN ('task', 'todo') THEN 'task'
  ELSE 'followup'
END
WHERE "type" NOT IN ('call', 'whatsapp', 'email', 'task', 'followup');--> statement-breakpoint
-- Reminders are now keyed on the due time they were sent for. Existing sent reminders are treated as
-- covering the follow-up's current due time, so nothing already reminded fires a second time.
UPDATE "reminders" r SET "remind_at" = f."due_at"
  FROM "follow_ups" f
  WHERE f."id" = r."follow_up_id" AND r."sent_at" IS NOT NULL;
