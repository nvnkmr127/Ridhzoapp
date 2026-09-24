ALTER TABLE "organizations" ADD COLUMN "meeting_confirm_template" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "meeting_reminder_template" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "meeting_template_language" varchar(20) DEFAULT 'en_US' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "daily_summary" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "daily_summary_sent_on" varchar(10);