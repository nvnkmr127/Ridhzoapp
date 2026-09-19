import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users, roles } from './users';

// Append-only trail of who did what. Written by AuditService; the application never updates or
// deletes rows here (no cleanup/retention job exists), and every read is org-scoped. This is
// application-level immutability, not tamper-evident storage — the DB role the app connects as
// still holds UPDATE/DELETE on this table, so it doesn't resist a compromised connection string.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  userId: uuid('user_id').references(() => users.id), // null = system/automation
  // Actor identity AS OF the event, snapshotted at write time. The live join to `users` (via
  // userId, for rows written before this existed) shows current identity — a renamed or
  // reactivated-under-a-new-name user would otherwise rewrite their own history. Null for
  // system/automation rows (userId is also null there) and for pre-migration rows.
  actorName: varchar('actor_name', { length: 255 }),
  actorEmail: varchar('actor_email', { length: 255 }),
  action: varchar('action', { length: 100 }).notNull(), // e.g. "lead.delete", "user.role_change"
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgCreatedIdx: index('audit_org_created_idx').on(t.organizationId, t.createdAt),
}));

// Bearer keys for the public REST API. Only the hash is stored; the raw key is shown once.
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Cascade: a deleted org takes its keys with it (no orphaned/FK-blocking rows).
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(), // sha256 hex
  prefix: varchar('prefix', { length: 16 }).notNull(), // display only, e.g. "pk_live_ab12"
  // 'full' = read+write (default, legacy behavior); 'read_only' = GET-only (enforced in apiAuth).
  scope: varchar('scope', { length: 16 }).notNull().default('full'),
  // Keys are workspace-owned; null the creator when that user is deleted rather than block it.
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('api_keys_org_idx').on(t.organizationId),
}));

// Per-org definitions for extra lead fields; values live in leads.custom_data keyed by `key`.
export const customFieldDefs = pgTable('custom_field_defs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  key: varchar('key', { length: 50 }).notNull(), // slug used in custom_data
  label: varchar('label', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('text'), // text, textarea, number, date, datetime, select, multiselect, checkbox, url
  options: jsonb('options').$type<string[]>().default([]), // for type=select / multiselect
  required: boolean('required').notNull().default(false),
  defaultValue: text('default_value'), // prefilled on new leads
  disabled: boolean('disabled').notNull().default(false), // keep the def but hide it from forms
  adminOnly: boolean('admin_only').notNull().default(false), // only admins see/edit
  showOnTable: boolean('show_on_table').notNull().default(false), // render as a column in the leads list
  // Optional two-level grouping for the lead detail view: `section` is the tab, `subsection` the
  // sub-tab under it. Null/empty = ungrouped (shown under the default "Custom Attributes" heading).
  section: varchar('section', { length: 100 }),
  subsection: varchar('subsection', { length: 100 }),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  // Unique so two field defs in one org can never share a key (which would make a lead's
  // custom_data value for that key ambiguous). create() also dedupes keys at the app layer.
  orgKeyIdx: uniqueIndex('custom_field_org_key_idx').on(t.organizationId, t.key),
}));

// Google Calendar OAuth tokens, one row per connected user. Booking events land on their calendar.
// ponytail: tokens stored plaintext — encrypt at rest (KMS/pgcrypto) before this holds real accounts.
export const googleCredentials = pgTable('google_credentials', {
  userId: uuid('user_id').references(() => users.id).primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiryDate: timestamp('expiry_date'),
  calendarId: varchar('calendar_id', { length: 255 }).notNull().default('primary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Email invitations. Accepting one creates the user in the org with the assigned role.
export const invitations = pgTable('invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  roleId: uuid('role_id').references(() => roles.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(), // sha256 hex of the raw token
  invitedById: uuid('invited_by_id').references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('invitations_org_idx').on(t.organizationId),
}));

// Password resets. Tokens are sha256-hashed with a 1-hour expiry.
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  emailIdx: index('password_resets_email_idx').on(t.email),
}));

