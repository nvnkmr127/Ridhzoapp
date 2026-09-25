import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
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

// Durable delivery log for outbound webhooks. Written by the web tier at enqueue time (so a Redis
// outage surfaces as a `failed` row instead of a silently-dropped event) and updated by the droplet
// worker as attempts run. Both tiers share Neon, so this is the ONLY place their state can meet —
// the DLQ (status='failed') and delivery stats are queries over this table, org-scoped.
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  endpointId: uuid('endpoint_id'), // nullable: endpoint may be deleted while a delivery is in flight
  jobId: varchar('job_id', { length: 128 }), // BullMQ job id, once enqueued
  eventId: varchar('event_id', { length: 64 }).notNull(),
  event: varchar('event', { length: 64 }).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(), // pending | delivered | failed | skipped
  attempts: integer('attempts').default(0).notNull(),
  lastStatusCode: integer('last_status_code'),
  errorReason: text('error_reason'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  orgStatusIdx: index('webhook_deliveries_org_status_idx').on(t.organizationId, t.status, t.updatedAt),
}));

// Lead distribution rules: when a new lead matches a rule's criteria, forward a copy to the rule's
// recipients. On lead.created we evaluate every active rule of the org and email the matching ones.
export type DistributionRecipient = {
  channel: 'email' | 'in_app' | 'whatsapp';
  value: string; // email address, user id, or phone number depending on channel
};
export type DistributionCondition = { field: string; operator: string; value: string };
// Single-level condition group: match ALL (AND) or ANY (OR) of the leaf conditions.
export type DistributionConditionGroup = { type: 'AND' | 'OR'; conditions: DistributionCondition[] };

export const leadDistributionRules = pgTable('lead_distribution_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 120 }), // optional human label
  sourceId: uuid('source_id').references(() => leadSources.id), // null = match any source
  conditions: jsonb('conditions').$type<DistributionConditionGroup>().default({ type: 'AND', conditions: [] }).notNull(),
  recipients: jsonb('recipients').$type<DistributionRecipient[]>().default([]).notNull(),
  mode: varchar('mode', { length: 20 }).default('all').notNull(), // 'all' | 'round_robin'
  rrCursor: integer('rr_cursor').default(0).notNull(), // round-robin rotation position
  skipSave: integer('skip_save').default(0).notNull(), // unused: "forward only" was removed (it trashed leads after every side effect ran); drop in a later migration
  isActive: integer('is_active').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('lead_distribution_org_idx').on(t.organizationId),
}));

// One row per (lead × recipient) forwarding attempt — the distribution delivery log. Also used to
// show per-recipient lead counts for round-robin load visibility.
export const leadDistributionDeliveries = pgTable('lead_distribution_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  ruleId: uuid('rule_id').references(() => leadDistributionRules.id, { onDelete: 'cascade' }).notNull(),
  leadId: uuid('lead_id'), // null for test sends
  channel: varchar('channel', { length: 20 }).notNull(),
  recipient: varchar('recipient', { length: 320 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'sent' | 'failed' | 'skipped'
  error: text('error'),
  isTest: integer('is_test').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  ruleIdx: index('lead_distribution_deliveries_rule_idx').on(t.ruleId, t.createdAt),
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
}, (t) => ({
  // Enforce webhook idempotency at the DB layer: one event per (provider, idempotency_key), so
  // concurrent duplicate deliveries can't create two events. Postgres treats NULL keys as distinct,
  // so events without a key (some providers) are unaffected.
  providerIdemUnique: uniqueIndex('webhook_events_provider_idem_key_unique').on(t.provider, t.idempotencyKey),
}));

export const leadIngestionLogs = pgTable('lead_ingestion_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id'), // can be null if ingestion failed completely
  sourceId: varchar('source_id', { length: 255 }).notNull(),
  originalPayload: jsonb('original_payload'),
  status: varchar('status', { length: 50 }).notNull(), // success, failed, deduplicated
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
