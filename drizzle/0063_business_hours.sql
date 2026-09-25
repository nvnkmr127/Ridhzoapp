ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "work_days" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "work_start_hour" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "work_end_hour" integer DEFAULT 20 NOT NULL;