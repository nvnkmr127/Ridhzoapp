import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { leads } from './leads';

// In-app notifications — the "New Lead Alert" that is Ridhzo's core hook.
// A bell/unread-count UI polls these; web-push (closed-tab delivery) is a later layer on top.
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(), // who gets alerted
  type: varchar('type', { length: 50 }).notNull(), // new_lead, follow_up_due, ...
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  leadId: uuid('lead_id').references(() => leads.id), // deep-link target, nullable
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Drives the unread bell: "my unread, newest first".
  userUnreadIdx: index('notifications_user_idx').on(table.userId, table.readAt, table.createdAt),
}));
