CREATE TABLE "lead_distribution_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel" varchar(20) DEFAULT 'email' NOT NULL,
	"destination" varchar(320) NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_distribution_recipients" ADD CONSTRAINT "lead_distribution_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_distribution_org_idx" ON "lead_distribution_recipients" USING btree ("organization_id");