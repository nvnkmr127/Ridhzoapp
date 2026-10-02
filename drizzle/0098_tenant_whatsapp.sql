ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "whatsapp_enabled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "whatsapp_api_key_enc" text;--> statement-breakpoint
ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "whatsapp_tenant_id" varchar(64);--> statement-breakpoint
ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "whatsapp_inbound_token" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_integration_settings_whatsapp_inbound_token_unique" ON "tenant_integration_settings" ("whatsapp_inbound_token");
