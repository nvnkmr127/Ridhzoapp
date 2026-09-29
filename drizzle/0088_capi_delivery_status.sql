ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "capi_last_status" varchar(16);--> statement-breakpoint
ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "capi_last_error" text;--> statement-breakpoint
ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "capi_last_at" timestamp;
