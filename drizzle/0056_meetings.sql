CREATE TABLE "meeting_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"map_url" text,
	"phone" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"organizer_id" uuid,
	"assignee_id" uuid,
	"mode" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"start_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"location_name" varchar(255),
	"address" text,
	"map_url" text,
	"meeting_url" text,
	"notes" text,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"outcome" text,
	"completed_at" timestamp,
	"checked_in_at" timestamp,
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"google_event_id" varchar(255),
	"google_event_owner_id" uuid,
	"booked_at" timestamp DEFAULT now() NOT NULL,
	"lead_reminder_24h_sent_at" timestamp,
	"lead_reminder_1h_sent_at" timestamp,
	"rep_reminder_sent_at" timestamp,
	"outcome_prompt_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_locations" ADD CONSTRAINT "meeting_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_google_event_owner_id_users_id_fk" FOREIGN KEY ("google_event_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_locations_org_idx" ON "meeting_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meetings_org_start_idx" ON "meetings" USING btree ("organization_id","start_at");--> statement-breakpoint
CREATE INDEX "meetings_lead_idx" ON "meetings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "meetings_assignee_status_start_idx" ON "meetings" USING btree ("assignee_id","status","start_at");--> statement-breakpoint
CREATE INDEX "meetings_status_start_idx" ON "meetings" USING btree ("status","start_at");--> statement-breakpoint
-- Move existing meeting / site-visit follow-ups into meetings, then drop them from follow_ups.
INSERT INTO "meetings" ("organization_id", "lead_id", "organizer_id", "assignee_id", "mode", "title", "start_at", "notes", "status", "completed_at", "booked_at", "created_at", "updated_at")
SELECT l."organization_id", f."lead_id", f."user_id", COALESCE(f."user_id", l."owner_id"),
  CASE WHEN lower(f."type") = 'site_visit' THEN 'site_visit' ELSE 'online' END,
  f."title", f."due_at", f."description",
  CASE f."status" WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'cancelled' ELSE 'scheduled' END,
  f."completed_at", f."created_at", f."created_at", f."updated_at"
FROM "follow_ups" f JOIN "leads" l ON l."id" = f."lead_id"
WHERE lower(f."type") IN ('meeting', 'site_visit') AND l."organization_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "reminders" WHERE "follow_up_id" IN (SELECT "id" FROM "follow_ups" WHERE lower("type") IN ('meeting', 'site_visit'));--> statement-breakpoint
DELETE FROM "follow_ups" WHERE lower("type") IN ('meeting', 'site_visit');
