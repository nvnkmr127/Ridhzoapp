ALTER TABLE "organizations" ADD COLUMN "ai_credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ai_credits_period" varchar(7);