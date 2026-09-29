CREATE TABLE "crn_counters" (
	"organization_id" uuid NOT NULL,
	"period" varchar(4) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "crn_counters_organization_id_period_pk" PRIMARY KEY("organization_id","period")
);
--> statement-breakpoint
CREATE TABLE "lead_seq_counters" (
	"lead_id" uuid NOT NULL,
	"kind" varchar(1) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lead_seq_counters_lead_id_kind_pk" PRIMARY KEY("lead_id","kind")
);
--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "crn" varchar(32);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "crn_counters" ADD CONSTRAINT "crn_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_seq_counters" ADD CONSTRAINT "lead_seq_counters_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_org_crn_unique" ON "leads" USING btree ("organization_id","crn");--> statement-breakpoint
-- Backfill: CRN per org per creation month, lifecycle/timeline numbers per lead in chronological order.
WITH n AS (
  SELECT id, to_char(created_at, 'YYMM') AS p,
         row_number() OVER (PARTITION BY organization_id, to_char(created_at, 'YYMM') ORDER BY created_at, id) AS rn
  FROM leads
)
UPDATE leads l SET crn = 'CRN-' || n.p || '-' || lpad(n.rn::text, 4, '0') FROM n WHERE l.id = n.id;--> statement-breakpoint
INSERT INTO crn_counters (organization_id, period, last_value)
SELECT organization_id, substr(crn, 5, 4), count(*) FROM leads WHERE crn IS NOT NULL GROUP BY 1, 2;--> statement-breakpoint
WITH n AS (SELECT id, row_number() OVER (PARTITION BY lead_id ORDER BY created_at, id) AS rn FROM lead_status_history)
UPDATE lead_status_history h SET seq = n.rn FROM n WHERE h.id = n.id;--> statement-breakpoint
WITH n AS (SELECT id, row_number() OVER (PARTITION BY lead_id ORDER BY created_at, id) AS rn FROM activities)
UPDATE activities a SET seq = n.rn FROM n WHERE a.id = n.id;--> statement-breakpoint
INSERT INTO lead_seq_counters (lead_id, kind, last_value)
SELECT lead_id, 'L', max(seq) FROM lead_status_history GROUP BY lead_id;--> statement-breakpoint
INSERT INTO lead_seq_counters (lead_id, kind, last_value)
SELECT lead_id, 'T', max(seq) FROM activities GROUP BY lead_id;--> statement-breakpoint
CREATE OR REPLACE FUNCTION assign_lead_crn() RETURNS trigger AS $$
DECLARE p varchar(4) := to_char(now() at time zone 'utc', 'YYMM'); n integer;
BEGIN
  IF NEW.crn IS NULL THEN
    INSERT INTO crn_counters (organization_id, period, last_value) VALUES (NEW.organization_id, p, 1)
    ON CONFLICT (organization_id, period) DO UPDATE SET last_value = crn_counters.last_value + 1
    RETURNING last_value INTO n;
    NEW.crn := 'CRN-' || p || '-' || lpad(n::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_assign_lead_crn ON leads;--> statement-breakpoint
CREATE TRIGGER trg_assign_lead_crn BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION assign_lead_crn();--> statement-breakpoint
-- TG_ARGV[0] is the counter kind: 'L' (lifecycle) or 'T' (timeline).
CREATE OR REPLACE FUNCTION assign_lead_seq() RETURNS trigger AS $$
BEGIN
  IF NEW.seq IS NULL THEN
    INSERT INTO lead_seq_counters (lead_id, kind, last_value) VALUES (NEW.lead_id, TG_ARGV[0], 1)
    ON CONFLICT (lead_id, kind) DO UPDATE SET last_value = lead_seq_counters.last_value + 1
    RETURNING last_value INTO NEW.seq;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_status_history_seq ON lead_status_history;--> statement-breakpoint
CREATE TRIGGER trg_status_history_seq BEFORE INSERT ON lead_status_history FOR EACH ROW EXECUTE FUNCTION assign_lead_seq('L');--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_activities_seq ON activities;--> statement-breakpoint
CREATE TRIGGER trg_activities_seq BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION assign_lead_seq('T');
