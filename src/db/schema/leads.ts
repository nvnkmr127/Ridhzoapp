import { pgTable, uuid, varchar, timestamp, integer, jsonb, index, uniqueIndex, numeric } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users, teams } from './users';
import { organizations } from './organizations';

export const leadSources = pgTable('lead_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 255 }), 
  isActive: integer('is_active').default(1).notNull(), // 1=active, 0=inactive
  config: jsonb('config').default({}),
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leadPipelines = pgTable('lead_pipelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leadPipelineStages = pgTable('lead_pipeline_stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  pipelineId: uuid('pipeline_id').references(() => leadPipelines.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

export const assignmentRules = pgTable('assignment_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').references(() => leadSources.id),
  teamId: uuid('team_id').references(() => teams.id),
  userId: uuid('user_id').references(() => users.id),
  type: varchar('type', { length: 50 }).default('source_direct').notNull(), // 'source_direct', 'source_round_robin'
  lastAssignedUserId: uuid('last_assigned_user_id').references(() => users.id),
  priority: integer('priority').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  displayId: integer('display_id'), // human-friendly per-org sequential number (Lead #1042); assigned by DB trigger on insert
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(), // tenant; backfilled
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 255 }),
  email: varchar('email', { length: 255 }),
  company: varchar('company', { length: 255 }),
  sourceId: uuid('source_id').references(() => leadSources.id),
  ownerId: uuid('owner_id').references(() => users.id),
  teamId: uuid('team_id').references(() => teams.id),
  pipelineId: uuid('pipeline_id').references(() => leadPipelines.id),
  stageId: uuid('stage_id').references(() => leadPipelineStages.id),
  status: varchar('status', { length: 50 }).notNull().default('new'), // new, active, won, lost, unqualified
  priority: varchar('priority', { length: 50 }).default('medium'), // low, medium, high
  score: integer('score').default(0),
  expectedValue: numeric('expected_value', { precision: 12, scale: 2 }),
  lostReason: varchar('lost_reason', { length: 120 }), // why a lead was lost/unqualified — powers win/loss analytics
  wonAt: timestamp('won_at'), // set when a lead is marked won — for cycle-time reporting
  customData: jsonb('custom_data').default({}),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  lastContactedAt: timestamp('last_contacted_at'),
  escalatedAt: timestamp('escalated_at'), // set when SLA escalation fires; prevents re-alerting
  deletedAt: timestamp('deleted_at'), // recycle bin: soft-delete timestamp; auto-purged 30 days later
  deletedBy: uuid('deleted_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('leads_org_idx').on(table.organizationId),
  emailIdx: index('leads_email_idx').on(table.email),
  phoneIdx: index('leads_phone_idx').on(table.phone),
  ownerIdx: index('leads_owner_idx').on(table.ownerId),
  pipelineStageIdx: index('leads_pipeline_stage_idx').on(table.pipelineId, table.stageId),
  orgCreatedIdx: index('leads_org_created_idx').on(table.organizationId, table.createdAt),
  orgPhoneIdx: index('leads_org_phone_idx').on(table.organizationId, table.phone),
  orgEmailIdx: index('leads_org_email_idx').on(table.organizationId, table.email),
  orgOwnerIdx: index('leads_org_owner_idx').on(table.organizationId, table.ownerId),
  orgStatusIdx: index('leads_org_status_idx').on(table.organizationId, table.status),
  orgSourceIdx: index('leads_org_source_idx').on(table.organizationId, table.sourceId),
  // Enforce per-tenant dedup at the DB layer (replaces the racy check-then-insert).
  // Partial: only active (non-deleted) rows with a real value participate, so soft-deleted
  // leads and blank contacts never collide.
  orgEmailUnique: uniqueIndex('leads_org_email_unique')
    .on(table.organizationId, table.email)
    .where(sql`${table.deletedAt} IS NULL AND ${table.email} IS NOT NULL AND ${table.email} <> ''`),
  orgPhoneUnique: uniqueIndex('leads_org_phone_unique')
    .on(table.organizationId, table.phone)
    .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL AND ${table.phone} <> ''`),
  // Per-tenant sequential display number. Multiple NULLs are allowed pre-backfill.
  orgDisplayIdUnique: uniqueIndex('leads_org_display_id_unique').on(table.organizationId, table.displayId),
}));

// Per-org counter for the human-friendly lead number. A trigger bumps last_value atomically on
// each lead insert (ON CONFLICT upsert), so every insert path gets a number without app code.
export const leadCounters = pgTable('lead_counters', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id),
  lastValue: integer('last_value').notNull().default(0),
});

export const leadStatusHistory = pgTable('lead_status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').references(() => leads.id).notNull(),
  oldStatus: varchar('old_status', { length: 50 }),
  newStatus: varchar('new_status', { length: 50 }).notNull(),
  changedById: uuid('changed_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leadTags = pgTable('lead_tags', {
  leadId: uuid('lead_id').references(() => leads.id).notNull(),
  tagId: uuid('tag_id').references(() => tags.id).notNull(),
}, (table) => ({
  pk: index('lead_tags_pk').on(table.leadId, table.tagId), // using index as pseudo-PK for simplicity
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  owner: one(users, { fields: [leads.ownerId], references: [users.id] }),
  source: one(leadSources, { fields: [leads.sourceId], references: [leadSources.id] }),
  pipeline: one(leadPipelines, { fields: [leads.pipelineId], references: [leadPipelines.id] }),
  stage: one(leadPipelineStages, { fields: [leads.stageId], references: [leadPipelineStages.id] }),
  tags: many(leadTags),
}));

export const customStatusConfigs = pgTable('custom_status_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  key: varchar('key', { length: 50 }).notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  color: varchar('color', { length: 50 }).default('#6B7280').notNull(),
  category: varchar('category', { length: 50 }).default('open').notNull(), // open, in_progress, won, lost, unqualified
  orderIndex: integer('order_index').default(0).notNull(),
  isSystemDefault: integer('is_system_default').default(0).notNull(), // 1=system, 0=custom
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

