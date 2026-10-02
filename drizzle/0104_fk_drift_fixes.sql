-- Foreign keys the TypeScript schema declares on lead_distribution_deliveries but the migration history never
-- created (found by diffing the real database against the schema). Each is added only when the existing rows
-- already satisfy it; otherwise the step is skipped with a NOTICE. Checks are by structure (column + target
-- table), not by name: Postgres truncates identifiers to 63 characters, so a name-based check never matched.
-- (email_verifications' FK and unique token_hash DO exist, under Postgres' default names.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f' AND conrelid = 'public.lead_distribution_deliveries'::regclass AND confrelid = 'public.organizations'::regclass) THEN
    IF EXISTS (SELECT 1 FROM lead_distribution_deliveries d WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = d.organization_id)) THEN
      RAISE NOTICE 'lead_distribution_deliveries -> organizations FK skipped: orphan rows exist';
    ELSE
      ALTER TABLE "lead_distribution_deliveries" ADD CONSTRAINT "lead_distribution_deliveries_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f' AND conrelid = 'public.lead_distribution_deliveries'::regclass AND confrelid = 'public.lead_distribution_rules'::regclass) THEN
    IF EXISTS (SELECT 1 FROM lead_distribution_deliveries d WHERE NOT EXISTS (SELECT 1 FROM lead_distribution_rules r WHERE r.id = d.rule_id)) THEN
      RAISE NOTICE 'lead_distribution_deliveries -> rules FK skipped: orphan rows exist';
    ELSE
      ALTER TABLE "lead_distribution_deliveries" ADD CONSTRAINT "lead_distribution_deliveries_rule_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."lead_distribution_rules"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
