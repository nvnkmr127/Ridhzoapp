CREATE TABLE "daily_summary_snapshots" (
	"organization_id" uuid NOT NULL,
	"day" varchar(10) NOT NULL,
	"counts" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_summary_snapshots_organization_id_day_pk" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "daily_summary_snapshots" ADD CONSTRAINT "daily_summary_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;