import { pgTable, uuid, varchar, text, timestamp, index, integer, doublePrecision } from 'drizzle-orm/pg-core';

import { leads } from './leads';
import { users } from './users';
import { organizations } from './organizations';

// A meeting with a lead: an online call, a site visit, a store/office visit or an in-person meet.
// Split out of follow_ups because it has a place, a length, attendees and an outcome — a follow-up
// is just a reminder to do something.
export const meetings = pgTable('meetings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  organizerId: uuid('organizer_id').references(() => users.id, { onDelete: 'set null' }), // who booked it (null = public booking page)
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }), // who attends
  mode: varchar('mode', { length: 20 }).notNull(), // online | site_visit | store_visit | in_person
  title: varchar('title', { length: 255 }).notNull(),
  startAt: timestamp('start_at').notNull(),
  durationMinutes: integer('duration_minutes').default(30).notNull(),
  // Where. Copied from a saved location at booking time so editing/deleting the location never
  // rewrites past meetings.
  locationName: varchar('location_name', { length: 255 }),
  address: text('address'),
  mapUrl: text('map_url'),
  meetingUrl: text('meeting_url'),
  notes: text('notes'),
  status: varchar('status', { length: 20 }).default('scheduled').notNull(), // scheduled | completed | no_show | cancelled
  outcome: text('outcome'),
  completedAt: timestamp('completed_at'),
  checkedInAt: timestamp('checked_in_at'),
  checkInLat: doublePrecision('check_in_lat'),
  checkInLng: doublePrecision('check_in_lng'),
  // Google Calendar event on the calendar of `googleEventOwnerId` (the assignee, or the organizer).
  googleEventId: varchar('google_event_id', { length: 255 }),
  googleEventOwnerId: uuid('google_event_owner_id').references(() => users.id, { onDelete: 'set null' }),
  // When the current time was booked (reset on reschedule). Lead reminders only fire when the
  // booking was made far enough ahead, so a meeting booked for "in 2 hours" doesn't get a 24h reminder.
  bookedAt: timestamp('booked_at').defaultNow().notNull(),
  leadReminder24hSentAt: timestamp('lead_reminder_24h_sent_at'),
  leadReminder1hSentAt: timestamp('lead_reminder_1h_sent_at'),
  repReminderSentAt: timestamp('rep_reminder_sent_at'),
  outcomePromptSentAt: timestamp('outcome_prompt_sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgStartIdx: index('meetings_org_start_idx').on(table.organizationId, table.startAt),
  leadIdx: index('meetings_lead_idx').on(table.leadId),
  assigneeStatusStartIdx: index('meetings_assignee_status_start_idx').on(table.assigneeId, table.status, table.startAt),
  statusStartIdx: index('meetings_status_start_idx').on(table.status, table.startAt),
}));

// Saved branches / stores / offices a lead can be invited to.
export const meetingLocations = pgTable('meeting_locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  mapUrl: text('map_url'),
  phone: varchar('phone', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('meeting_locations_org_idx').on(table.organizationId),
}));
