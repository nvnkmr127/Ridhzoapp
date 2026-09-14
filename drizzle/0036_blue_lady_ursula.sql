CREATE TABLE "lead_distribution_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"lead_id" uuid,
	"channel" varchar(20) NOT NULL,
	"recipient" varchar(320) NOT NULL,
	"status" varchar(20) NOT NULL,
	"error" text,
	"is_test" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_distribution_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(120),
	"source_id" uuid,
	"conditions" jsonb DEFAULT '{"type":"AND","conditions":[]}'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mode" varchar(20) DEFAULT 'all' NOT NULL,
	"rr_cursor" integer DEFAULT 0 NOT NULL,
	"skip_save" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_distribution_deliveries" ADD CONSTRAINT "lead_distribution_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_distribution_deliveries" ADD CONSTRAINT "lead_distribution_deliveries_rule_id_lead_distribution_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."lead_distribution_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_distribution_rules" ADD CONSTRAINT "lead_distribution_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_distribution_rules" ADD CONSTRAINT "lead_distribution_rules_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_distribution_deliveries_rule_idx" ON "lead_distribution_deliveries" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_distribution_org_idx" ON "lead_distribution_rules" USING btree ("organization_id");