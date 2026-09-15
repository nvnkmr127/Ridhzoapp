ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scope" varchar(16) DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;