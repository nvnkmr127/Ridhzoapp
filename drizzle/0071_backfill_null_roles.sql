-- A user with no role used to resolve to the system ADMIN role (rbac currentRole fallback). That
-- fallback now resolves to MEMBER, so give every roleless user an explicit role first:
--   1. each workspace's owner (its earliest-created live user) → admin;
--   2. a workspace still left without any active admin → its earliest active roleless user → admin;
--   3. every other live roleless user, and open invites with no role → member.
-- "Admin" mirrors UserService's lockout check: users.manage, the "*" wildcard, or the system admin role.
UPDATE "users" u SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'admin' AND "organization_id" IS NULL LIMIT 1)
  WHERE u."role_id" IS NULL AND u."deleted_at" IS NULL AND u."organization_id" IS NOT NULL
    AND u."id" = (SELECT x."id" FROM "users" x WHERE x."organization_id" = u."organization_id" AND x."deleted_at" IS NULL ORDER BY x."created_at", x."id" LIMIT 1);--> statement-breakpoint
UPDATE "users" u SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'admin' AND "organization_id" IS NULL LIMIT 1)
  WHERE u."role_id" IS NULL AND u."deleted_at" IS NULL AND u."is_active"
    AND u."id" = (SELECT x."id" FROM "users" x WHERE x."organization_id" = u."organization_id" AND x."role_id" IS NULL AND x."deleted_at" IS NULL AND x."is_active" ORDER BY x."created_at", x."id" LIMIT 1)
    AND NOT EXISTS (
      SELECT 1 FROM "users" a JOIN "roles" r ON r."id" = a."role_id"
      WHERE a."organization_id" = u."organization_id" AND a."is_active" AND a."deleted_at" IS NULL
        AND (r."permissions" @> '["users.manage"]'::jsonb OR r."permissions" @> '["*"]'::jsonb OR (r."organization_id" IS NULL AND lower(r."name") = 'admin'))
    );--> statement-breakpoint
UPDATE "users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'member' AND "organization_id" IS NULL LIMIT 1)
  WHERE "role_id" IS NULL AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "invitations" SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'member' AND "organization_id" IS NULL LIMIT 1)
  WHERE "role_id" IS NULL AND "accepted_at" IS NULL;
