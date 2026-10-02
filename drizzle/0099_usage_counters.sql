CREATE TABLE IF NOT EXISTS "usage_counters" (
	"organization_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"metric" varchar(32) NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_organization_id_period_metric_pk" PRIMARY KEY("organization_id","period","metric")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
