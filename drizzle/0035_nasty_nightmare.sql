CREATE TABLE "lead_counters" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "display_id" integer;--> statement-breakpoint
ALTER TABLE "lead_counters" ADD CONSTRAINT "lead_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_org_display_id_unique" ON "leads" USING btree ("organization_id","display_id");--> statement-breakpoint
-- Backfill existing leads with per-org sequential numbers, ordered by creation.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS rn
  FROM leads
)
UPDATE leads l SET display_id = n.rn FROM numbered n WHERE l.id = n.id;--> statement-breakpoint
-- Seed each org's counter from its current max.
INSERT INTO lead_counters (organization_id, last_value)
SELECT organization_id, MAX(display_id) FROM leads GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE SET last_value = EXCLUDED.last_value;--> statement-breakpoint
-- Assign the next per-org number on insert. The ON CONFLICT upsert locks the counter row,
-- so concurrent inserts for the same org serialize and never collide.
CREATE OR REPLACE FUNCTION assign_lead_display_id() RETURNS trigger AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    INSERT INTO lead_counters (organization_id, last_value)
    VALUES (NEW.organization_id, 1)
    ON CONFLICT (organization_id) DO UPDATE SET last_value = lead_counters.last_value + 1
    RETURNING last_value INTO NEW.display_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_assign_lead_display_id ON leads;--> statement-breakpoint
CREATE TRIGGER trg_assign_lead_display_id BEFORE INSERT ON leads
FOR EACH ROW EXECUTE FUNCTION assign_lead_display_id();