-- "pro"/"business" were renamed Starter/Unlimited. Store the current names so reports, filters and
-- broadcasts match without special-casing (code still maps old names defensively via canonicalPlan).
UPDATE "organizations" SET "plan" = 'starter' WHERE "plan" = 'pro';--> statement-breakpoint
UPDATE "organizations" SET "plan" = 'unlimited' WHERE "plan" = 'business';
