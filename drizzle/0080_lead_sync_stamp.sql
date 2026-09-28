DROP INDEX IF EXISTS "leads_org_updated_idx";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "sync_at" timestamp DEFAULT date_trunc('milliseconds', now() at time zone 'utc') NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_org_sync_idx" ON "leads" USING btree ("organization_id","sync_at","id");--> statement-breakpoint
-- Every write to a lead, from any code path (services, workers, raw SQL), moves it into the phones'
-- next incremental sync. clock_timestamp(): the time of the write, not of the transaction's start.
CREATE OR REPLACE FUNCTION leads_stamp_sync_at() RETURNS trigger AS $$
BEGIN
  NEW.sync_at := date_trunc('milliseconds', clock_timestamp() at time zone 'utc');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS leads_stamp_sync_at ON "leads";--> statement-breakpoint
CREATE TRIGGER leads_stamp_sync_at BEFORE INSERT OR UPDATE ON "leads" FOR EACH ROW EXECUTE FUNCTION leads_stamp_sync_at();
