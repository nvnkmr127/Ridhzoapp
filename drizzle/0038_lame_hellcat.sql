ALTER TABLE "sequence_steps" ADD COLUMN "attachment_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "description" text;