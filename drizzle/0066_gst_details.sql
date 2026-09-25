ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "billing_name" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "gstin" varchar(15);