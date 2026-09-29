ALTER TABLE "tenant_integration_settings" ADD COLUMN IF NOT EXISTS "capi_token_expires_at" timestamp;
