ALTER TABLE "email_settings" ADD COLUMN "reply_to" varchar(255);--> statement-breakpoint
ALTER TABLE "email_settings" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_settings" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "email_settings" ADD COLUMN "last_error_at" timestamp;