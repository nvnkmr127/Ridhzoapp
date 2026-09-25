ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "complimentary" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "complimentary_until" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "complimentary_note" varchar(255);--> statement-breakpoint
-- Workspaces already on a paid plan with no Razorpay subscription and no trial were given it free by
-- an admin — mark them complimentary so revenue reports stop counting them.
UPDATE "organizations" SET "complimentary" = 1, "complimentary_note" = 'Granted before complimentary tracking'
  WHERE "plan" IN ('starter', 'unlimited', 'pro', 'business') AND "razorpay_subscription_id" IS NULL AND "trial_ends_at" IS NULL;
