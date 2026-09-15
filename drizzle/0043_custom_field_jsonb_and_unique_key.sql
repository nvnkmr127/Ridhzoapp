-- Custom-fields hardening.
--
-- 1) Normalize any jsonb columns that were stored as a JSON *string* scalar (double-encoded by a
--    driver/runtime that didn't recognize the jsonb OID) back into real objects/arrays, so raw
--    jsonb access (custom_data ->> 'key', filters/saved views) works and options read as arrays.
UPDATE "custom_field_defs" SET "options" = ("options" #>> '{}')::jsonb
  WHERE jsonb_typeof("options") = 'string';

UPDATE "leads" SET "custom_data" = ("custom_data" #>> '{}')::jsonb
  WHERE "custom_data" IS NOT NULL AND jsonb_typeof("custom_data") = 'string';
--> statement-breakpoint

-- 2) De-duplicate any field keys that collide within an org (keeping the earliest), then enforce
--    uniqueness so two defs can never share a key again.
WITH d AS (
  SELECT "id", "key",
    row_number() OVER (PARTITION BY "organization_id", "key" ORDER BY "created_at", "id") AS rn
  FROM "custom_field_defs"
)
UPDATE "custom_field_defs" c
  SET "key" = left(c."key", 44) || '_dup' || d.rn
  FROM d WHERE c."id" = d."id" AND d.rn > 1;
--> statement-breakpoint

DROP INDEX IF EXISTS "custom_field_org_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_org_key_idx" ON "custom_field_defs" ("organization_id","key");
