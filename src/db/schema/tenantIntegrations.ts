import { pgTable, uuid, varchar, integer, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Per-tenant integration config that used to live in platform env vars. Tenants configure these
// from the frontend (Settings → Lead Intelligence); the platform/super-admin env only holds
// platform-wide keys (e.g. the AI provider key). Secrets are stored encrypted (lib/crypto/secret).
export const tenantIntegrationSettings = pgTable('tenant_integration_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),

  // Lead enrichment — each tenant brings its own provider. Nothing about the request is baked in:
  // the auth header name + value and the timeout are all configured, so any JSON provider works.
  enrichmentEnabled: integer('enrichment_enabled').default(0).notNull(),
  enrichmentApiUrl: varchar('enrichment_api_url', { length: 500 }),
  enrichmentAuthHeader: varchar('enrichment_auth_header', { length: 100 }), // e.g. Authorization / x-api-key
  enrichmentAuthValueEnc: text('enrichment_auth_value_enc'), // encrypted full header value, e.g. "Bearer sk-…"
  enrichmentTimeoutMs: integer('enrichment_timeout_ms'), // request timeout; null = provider default

  // Inbound email → timeline — each tenant gets its own webhook token (identifies the org and
  // authorises the POST), replacing the single platform EMAIL_INBOUND_SECRET.
  inboundEmailEnabled: integer('inbound_email_enabled').default(0).notNull(),
  inboundEmailToken: varchar('inbound_email_token', { length: 64 }).unique(),

  // Meta Conversions API — server-side conversion events per tenant. Pixel/Dataset id + a
  // system-user access token (encrypted). Optional test-event code routes to Meta's test tab.
  capiEnabled: integer('capi_enabled').default(0).notNull(),
  capiPixelId: varchar('capi_pixel_id', { length: 64 }),
  capiAccessTokenEnc: text('capi_access_token_enc'),
  capiTestEventCode: varchar('capi_test_event_code', { length: 64 }),
  // Conversion Leads: CRM status → Meta lead-stage event name. Null = use the built-in default map.
  capiLeadStageMap: jsonb('capi_lead_stage_map').$type<Record<string, string>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
