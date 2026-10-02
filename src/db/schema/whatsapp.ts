import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { leads } from './leads';
import { users } from './users';

// Every outbound (and later inbound) WhatsApp message sent via the BSP (Watxio).
// activities can't hold delivery status / provider ids, so this is its own log.
export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id), // who sent it; null for automation
  direction: varchar('direction', { length: 10 }).notNull().default('outbound'), // outbound | inbound
  providerMessageId: varchar('provider_message_id', { length: 255 }), // id returned by Watxio
  templateName: varchar('template_name', { length: 255 }), // set when sent as an approved template
  body: text('body'), // rendered text actually sent
  status: varchar('status', { length: 20 }).notNull().default('queued'), // queued|sent|delivered|read|failed
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  leadIdx: index('wa_messages_lead_idx').on(table.leadId),
  providerMsgIdx: index('wa_messages_provider_msg_idx').on(table.providerMessageId),
  // One row per provider message id: a re-delivered webhook can't record the same message twice.
  providerMsgUnique: uniqueIndex('wa_messages_provider_msg_unique').on(table.providerMessageId).where(sql`${table.providerMessageId} IS NOT NULL`),
}));
