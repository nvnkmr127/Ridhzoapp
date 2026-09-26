ALTER TABLE "activities" ADD COLUMN "duration_sec" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "external_ref" varchar(100);--> statement-breakpoint
CREATE INDEX "activities_user_occurred_idx" ON "activities" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_user_external_ref_unique" ON "activities" USING btree ("user_id","external_ref") WHERE "activities"."external_ref" IS NOT NULL;