-- Facebook Lead Source hardening.
--
-- 1) Enforce webhook idempotency at the DB layer. The webhook receivers did a check-then-insert on
--    (provider, idempotency_key) with no unique index, so concurrent duplicate deliveries (Meta
--    fans out retries) could create two events for one leadgen. First collapse any duplicates the
--    old race already produced — keep the most-progressed row per group (processed wins, else the
--    earliest) — then add the unique index. NULL keys are left untouched (Postgres treats NULLs as
--    distinct, so keyless events from other providers never collide).
DELETE FROM "webhook_events"
WHERE "idempotency_key" IS NOT NULL
  AND "id" NOT IN (
    SELECT DISTINCT ON ("provider", "idempotency_key") "id"
    FROM "webhook_events"
    WHERE "idempotency_key" IS NOT NULL
    ORDER BY "provider", "idempotency_key", ("status" = 'processed') DESC, "created_at" ASC, "id" ASC
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_idem_key_unique" ON "webhook_events" ("provider","idempotency_key");
--> statement-breakpoint

-- 2) Index the Facebook Page-id lookup. Every inbound leadgen webhook matches lead sources by
--    config->>'pageId'; without this it's a sequential scan of all facebook_lead_ads sources.
CREATE INDEX "lead_sources_page_id_idx" ON "lead_sources" (("config"->>'pageId'));
