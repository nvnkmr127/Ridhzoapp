import { pgTable, uuid, varchar, timestamp, jsonb, integer, text } from 'drizzle-orm/pg-core';

// The tenant. Every tenant-scoped row carries organization_id; a user belongs to exactly one org.
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).default('free').notNull(),
  suspendedAt: timestamp('suspended_at'), // set by a platform super-admin; blocks the org's logins

  // Localisation
  timezone: varchar('timezone', { length: 64 }).default('UTC').notNull(),
  locale: varchar('locale', { length: 10 }).default('en').notNull(),
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  dateFormat: varchar('date_format', { length: 20 }).default('MM/DD/YYYY').notNull(),

  // Company information
  industry: varchar('industry', { length: 120 }),
  // Free-text business description the tenant writes ("what we sell, tone, key offerings"). Fed to
  // the AI assists so multi-tenant generations speak as each business. Future: filled from docs/site.
  aiContext: text('ai_context'),
  phone: varchar('phone', { length: 30 }),
  website: varchar('website', { length: 255 }),
  addressLine1: varchar('address_line1', { length: 255 }),
  city: varchar('city', { length: 120 }),
  state: varchar('state', { length: 120 }),
  postalCode: varchar('postal_code', { length: 20 }),
  country: varchar('country', { length: 2 }),

  // Which lead fields are required at capture. "name" is always required by the column NOT NULL.
  requiredLeadFields: jsonb('required_lead_fields').$type<string[]>().default(['name']).notNull(),

  // Hours a new lead may sit unactioned before it escalates. Null = SLA escalation off.
  slaHours: integer('sla_hours'),

  // When 1, a new lead sharing an email/phone with an existing one is auto-merged into it on arrival.
  autoMergeDuplicates: integer('auto_merge_duplicates').default(0).notNull(),

  // Sequence "quiet hours": only send drip steps between these local hours (in `timezone`).
  // Null on either = no window (send any time). Steps due outside defer to the next window open.
  sequenceWindowStart: integer('sequence_window_start'), // 0-23
  sequenceWindowEnd: integer('sequence_window_end'), // 1-24, exclusive

  // WhatsApp send mode: 'personal' = one-tap wa.me from the rep's own number (Ridhzo-style,
  // no BSP setup); 'bsp' = send through the WhatsApp Business API. Solos default to personal.
  whatsappMode: varchar('whatsapp_mode', { length: 10 }).default('personal').notNull(),

  // Billing (Razorpay). plan (above) is the source of truth for entitlements; these track the subscription.
  razorpayCustomerId: varchar('razorpay_customer_id', { length: 255 }),
  razorpaySubscriptionId: varchar('razorpay_subscription_id', { length: 255 }),
  planStatus: varchar('plan_status', { length: 30 }).default('active').notNull(), // active, created, halted, cancelled
  currentPeriodEnd: timestamp('current_period_end'),
  trialEndsAt: timestamp('trial_ends_at'), // auto-reverts to 'free' when expired if not paying

  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Bumped on every settings write; used for optimistic concurrency so two admins saving at once
  // don't silently clobber each other (the stale save is rejected with a conflict).
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
