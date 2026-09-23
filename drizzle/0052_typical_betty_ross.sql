CREATE INDEX "lead_status_history_lead_created_idx" ON "lead_status_history" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_org_status_created_idx" ON "leads" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "follow_ups_lead_status_due_idx" ON "follow_ups" USING btree ("lead_id","status","due_at");