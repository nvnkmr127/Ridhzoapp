import { pgTable, uuid, varchar, text, timestamp, boolean, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
// jsonb used for role permissions and user email opt-out list.
import { relations, sql } from 'drizzle-orm';
import { organizations } from './organizations';

// organizationId null = shared system role (admin/member). Non-null = a custom role owned by that org.
// permissions is an array of permission keys (see src/lib/permissions.ts); admin implicitly has all.
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  permissions: jsonb('permissions').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id), // tenant scope; backfilled
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  // One team per name per org, ignoring case (TeamService also checks, for a friendly message).
  orgNameUnique: uniqueIndex('teams_org_name_unique').on(t.organizationId, sql`lower(${t.name})`),
}));

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id), // required in practice; backfilled
  // Null for people who registered with a phone number only (unique still holds for real addresses).
  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 30 }),
  // App language for this person's menu and phone notifications ('en' | 'hi' | 'te'). See lib/i18n.
  language: varchar('language', { length: 5 }).default('en').notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  // false = random hash from a Google/WhatsApp signup; the user never chose a password, so the
  // profile lets them set one without asking for the current password.
  passwordSet: boolean('password_set').default(true).notNull(),
  // 'phone' = registered with a mobile number (drives the "complete your account" prompt).
  signupMethod: varchar('signup_method', { length: 10 }),
  emailVerifiedAt: timestamp('email_verified_at'), // set once the email is proven (link click or Google)
  googleLinkedAt: timestamp('google_linked_at'),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  roleId: uuid('role_id').references(() => roles.id),
  teamId: uuid('team_id').references(() => teams.id),
  isActive: boolean('is_active').default(true).notNull(),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(), // platform operator — cross-tenant access
  // Platform-operator TOTP (see lib/auth/adminMfa). Secret is encrypted at rest; enabled_at null = not enrolled.
  totpSecret: text('totp_secret'),
  totpEnabledAt: timestamp('totp_enabled_at'),
  deletedAt: timestamp('deleted_at'), // soft delete — hard delete would orphan lead/activity FKs
  emailOptOut: jsonb('email_opt_out').$type<string[]>().default([]).notNull(), // notification types the user muted for email
  lastCallSyncAt: timestamp('last_call_sync_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  team: one(teams, { fields: [users.teamId], references: [teams.id] }),
}));
