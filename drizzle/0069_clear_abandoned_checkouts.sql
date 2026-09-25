-- The old checkout saved an unfinished Razorpay subscription onto the workspace (plan_status
-- 'created') before any payment. Those were never paid: drop the stale link so billing, webhooks and
-- cancel don't act on an abandoned checkout, and mark the workspace active again.
UPDATE "organizations" SET "razorpay_subscription_id" = NULL, "plan_status" = 'active'
  WHERE "plan_status" = 'created';--> statement-breakpoint
-- Paid plans with no payment behind them were given by an admin — track them as free-for-client.
UPDATE "organizations" SET "complimentary" = 1, "complimentary_note" = 'Granted before complimentary tracking'
  WHERE "plan" IN ('starter', 'unlimited') AND "razorpay_subscription_id" IS NULL AND "trial_ends_at" IS NULL AND "complimentary" = 0;
