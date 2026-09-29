-- platform_configs used to be created at runtime (PlatformConfigService.ensureTable); existing DBs already have it.
CREATE TABLE IF NOT EXISTS "platform_configs" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"org_name" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" varchar(255) NOT NULL,
	"subject" text NOT NULL,
	"category" varchar(20) NOT NULL,
	"priority" varchar(10) NOT NULL,
	"status" varchar(16) NOT NULL,
	"assigned_to" varchar(255),
	"sla_deadline" timestamp NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_invoices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"org_id" uuid NOT NULL,
	"org_name" varchar(255) NOT NULL,
	"buyer_name" varchar(255),
	"plan" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"cgst" numeric(12, 2),
	"sgst" numeric(12, 2),
	"igst" numeric(12, 2),
	"place_of_supply" varchar(2),
	"total_amount" numeric(12, 2) NOT NULL,
	"sac_code" varchar(10) NOT NULL,
	"gstin" varchar(15),
	"status" varchar(16) NOT NULL,
	"type" varchar(16) DEFAULT 'invoice' NOT NULL,
	"original_invoice_id" varchar(64),
	"payment_id" varchar(64),
	"issued_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	CONSTRAINT "tax_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "tax_invoices_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_tickets_org_idx" ON "support_tickets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tax_invoices_org_idx" ON "tax_invoices" USING btree ("org_id","issued_at");--> statement-breakpoint
CREATE INDEX "tax_invoices_issued_idx" ON "tax_invoices" USING btree ("issued_at");--> statement-breakpoint
-- Copy invoices + tickets out of their old single-JSON-row storage. The old rows are kept, renamed, as a backup.
INSERT INTO "tax_invoices" ("id","invoice_number","org_id","org_name","buyer_name","plan","amount","tax_rate","tax_amount","cgst","sgst","igst","place_of_supply","total_amount","sac_code","gstin","status","type","original_invoice_id","payment_id","issued_at","paid_at","period_start","period_end")
SELECT e->>'id', e->>'invoiceNumber', (e->>'orgId')::uuid, coalesce(e->>'orgName',''), e->>'buyerName', coalesce(e->>'plan',''),
  (e->>'amount')::numeric, coalesce((e->>'taxRate')::numeric,18), (e->>'taxAmount')::numeric,
  (e->>'cgst')::numeric, (e->>'sgst')::numeric, (e->>'igst')::numeric, e->>'placeOfSupply',
  (e->>'totalAmount')::numeric, coalesce(e->>'sacCode','998313'), e->>'gstin', e->>'status', coalesce(e->>'type','invoice'),
  e->>'originalInvoiceId', e->>'paymentId',
  (e->>'issuedAt')::timestamptz AT TIME ZONE 'UTC', (e->>'paidAt')::timestamptz AT TIME ZONE 'UTC',
  coalesce(e->>'periodStart',e->>'issuedAt')::timestamptz AT TIME ZONE 'UTC', coalesce(e->>'periodEnd',e->>'issuedAt')::timestamptz AT TIME ZONE 'UTC'
FROM "platform_configs" c, jsonb_array_elements(c."value") e
WHERE c."key" = 'tax_invoices' AND jsonb_typeof(c."value") = 'array'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "support_tickets" ("id","org_id","org_name","user_id","user_email","subject","category","priority","status","assigned_to","sla_deadline","messages","internal_notes","created_at","updated_at")
SELECT e->>'id', (e->>'orgId')::uuid, coalesce(e->>'orgName',''), (e->>'userId')::uuid, coalesce(e->>'userEmail','unknown'), coalesce(e->>'subject',''),
  coalesce(e->>'category','technical'), coalesce(e->>'priority','medium'), coalesce(e->>'status','open'), e->>'assignedTo',
  coalesce(e->>'slaDeadline',e->>'createdAt')::timestamptz AT TIME ZONE 'UTC',
  coalesce(e->'messages','[]'::jsonb), coalesce(e->'internalNotes','[]'::jsonb),
  (e->>'createdAt')::timestamptz AT TIME ZONE 'UTC', coalesce(e->>'updatedAt',e->>'createdAt')::timestamptz AT TIME ZONE 'UTC'
FROM "platform_configs" c, jsonb_array_elements(c."value") e
WHERE c."key" = 'support_tickets' AND jsonb_typeof(c."value") = 'array'
  AND e->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM "organizations" o WHERE o."id"::text = e->>'orgId') -- tickets of already-deleted tenants are dropped
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "platform_configs" SET "key" = "key" || '_pre_0085' WHERE "key" IN ('tax_invoices','support_tickets');
