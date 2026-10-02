-- Tenant columns that were nullable "until backfilled" become NOT NULL, and assignment_rules (which had no
-- tenant column at all) gets one. Each step only applies when the data is already clean; otherwise it is
-- skipped with a NOTICE and can be re-run after fixing the listed rows. users.organization_id stays
-- nullable on purpose: platform super-admins belong to no workspace. roles.organization_id is null for the
-- shared system roles.
ALTER TABLE "assignment_rules" ADD COLUMN IF NOT EXISTS "organization_id" uuid;--> statement-breakpoint
UPDATE "assignment_rules" r SET "organization_id" = s."organization_id" FROM "lead_sources" s WHERE r."organization_id" IS NULL AND r."source_id" = s."id";--> statement-breakpoint
UPDATE "assignment_rules" r SET "organization_id" = u."organization_id" FROM "users" u WHERE r."organization_id" IS NULL AND r."user_id" = u."id";--> statement-breakpoint
UPDATE "assignment_rules" r SET "organization_id" = t."organization_id" FROM "teams" t WHERE r."organization_id" IS NULL AND r."team_id" = t."id";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "assignment_rules" WHERE "organization_id" IS NULL) THEN
    ALTER TABLE "assignment_rules" ALTER COLUMN "organization_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'assignment_rules.organization_id left nullable: % rows could not be attributed to a workspace', (SELECT count(*) FROM "assignment_rules" WHERE "organization_id" IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "teams" WHERE "organization_id" IS NULL) THEN
    ALTER TABLE "teams" ALTER COLUMN "organization_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'teams.organization_id left nullable: % rows have no workspace', (SELECT count(*) FROM "teams" WHERE "organization_id" IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "lead_sources" WHERE "organization_id" IS NULL) THEN
    ALTER TABLE "lead_sources" ALTER COLUMN "organization_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'lead_sources.organization_id left nullable: % rows have no workspace', (SELECT count(*) FROM "lead_sources" WHERE "organization_id" IS NULL);
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_org_idx" ON "assignment_rules" ("organization_id");
