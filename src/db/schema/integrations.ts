import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { leadSources } from './leads';

// Outbound webhook endpoints registered per org. On subscribed lead events we POST a signed
// JSON payload to `url`; failures retry with backoff and land in the DLQ.
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  events: jsonb('events').$type<string[]>().default([]).notNull(),
  isActive: integer('is_active').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('webhook_endpoints_org_idx').on(t.organizationId),
}));

// Lead distribution rules: when a new lead matches a rule's criteria, forward a copy to the rule's
// recipients. On lead.created we evaluate every active rule of the org and email the matching ones.
export const leadDistributionRules = pgTable('lead_distribution_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  sourceId: uuid('source_id').references(() => leadSources.id), // null = match any source
  recipients: jsonb('recipients').$type<string[]>().default([]).notNull(), // email addresses
  skipSave: integer('skip_save').default(0).notNull(), // 1 = forward only, drop from the CRM
  isActive: integer('is_active').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('lead_distribution_org_idx').on(t.organizationId),
}));

export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const integrationAccounts = pgTable('integration_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  integrationId: uuid('integration_id').references(() => integrations.id).notNull(),
  credentials: jsonb('credentials').notNull(),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 255 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 50 }).default('pending'), // pending, processing, processed, failed
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  retryCount: integer('retry_count').default(0).notNull(),
  errorLog: jsonb('error_log'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leadIngestionLogs = pgTable('lead_ingestion_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id'), // can be null if ingestion failed completely
  sourceId: varchar('source_id', { length: 255 }).notNull(),
  originalPayload: jsonb('original_payload'),
  status: varchar('status', { length: 50 }).notNull(), // success, failed, deduplicated
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
