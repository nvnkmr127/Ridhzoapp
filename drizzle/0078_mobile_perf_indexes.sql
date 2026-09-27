CREATE INDEX IF NOT EXISTS "leads_org_owner_created_idx" ON "leads" USING btree ("organization_id","owner_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_org_lower_email_idx" ON "leads" USING btree ("organization_id",lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_enrollments_sequence_idx" ON "sequence_enrollments" USING btree ("sequence_id");