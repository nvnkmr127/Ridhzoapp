-- Companion to the RBAC fix: hasPermission no longer treats a TENANT-owned role named "admin" as
-- implicitly all-powerful (only the shared system admin role, organization_id IS NULL, is). Preserve
-- the access existing tenant "admin" roles already had by granting them the "*" wildcard explicitly,
-- so their members keep full permissions without relying on the role name.
UPDATE "roles"
SET "permissions" = '["*"]'::jsonb, "updated_at" = now()
WHERE "organization_id" IS NOT NULL
  AND lower("name") = 'admin'
  AND NOT ("permissions" @> '["*"]'::jsonb);
