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
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 30 }),
  // App language for this person's menu and phone notifications ('en' | 'hi' | 'te'). See lib/i18n.
  language: varchar('language', { length: 5 }).default('en').notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  roleId: uuid('role_id').references(() => roles.id),
  teamId: uuid('team_id').references(() => teams.id),
  isActive: boolean('is_active').default(true).notNull(),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(), // platform operator — cross-tenant access
  deletedAt: timestamp('deleted_at'), // soft delete — hard delete would orphan lead/activity FKs
  emailOptOut: jsonb('email_opt_out').$type<string[]>().default([]).notNull(), // notification types the user muted for email
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  team: one(teams, { fields: [users.teamId], references: [teams.id] }),
}));
