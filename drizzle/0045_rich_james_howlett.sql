-- Enforce one status key per tenant on custom_status_configs.
--
-- The service seeded defaults and upserted custom statuses with a check-then-insert and no unique
-- index, so a race (two first-loads, or concurrent adds of the same key) could duplicate rows.
-- First collapse any duplicates the old race already produced — keep the system-default row if one
-- exists in the group, else the earliest — then add the unique index.
DELETE FROM "custom_status_configs"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("organization_id", "key") "id"
  FROM "custom_status_configs"
  ORDER BY "organization_id", "key", "is_system_default" DESC, "created_at" ASC, "id" ASC
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_status_configs_org_key_unique" ON "custom_status_configs" USING btree ("organization_id","key");
