import { pgTable, uuid, varchar, timestamp, jsonb, integer, text } from 'drizzle-orm/pg-core';

// The tenant. Every tenant-scoped row carries organization_id; a user belongs to exactly one org.
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).default('free').notNull(),
  suspendedAt: timestamp('suspended_at'), // set by a platform super-admin; blocks the org's logins

  // Localisation
  // India defaults — Ridhzo's market. The admin banner offers the device timezone if it differs.
  timezone: varchar('timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
  locale: varchar('locale', { length: 10 }).default('en-IN').notNull(),
  currency: varchar('currency', { length: 3 }).default('INR').notNull(),
  dateFormat: varchar('date_format', { length: 20 }).default('DD/MM/YYYY').notNull(),

  // Company information
  industry: varchar('industry', { length: 120 }),
  // Free-text business description the tenant writes ("what we sell, tone, key offerings"). Fed to
  // the AI assists so multi-tenant generations speak as each business. Future: filled from docs/site.
  aiContext: text('ai_context'),
  phone: varchar('phone', { length: 30 }),
  website: varchar('website', { length: 255 }),
  addressLine1: varchar('address_line1', { length: 255 }),
  city: varchar('city', { length: 120 }),
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

  // Approved WhatsApp templates (Business API mode) for meeting messages outside the 24h window.
  // Variables: {{1}} first name, {{2}} meeting type, {{3}} date & time, {{4}} place or join link.
  meetingConfirmTemplate: varchar('meeting_confirm_template', { length: 255 }),
  meetingReminderTemplate: varchar('meeting_reminder_template', { length: 255 }),
  meetingTemplateLanguage: varchar('meeting_template_language', { length: 20 }).default('en_US').notNull(),

  // Morning team summary email to admins (overdue follow-ups, meetings without outcome, new leads…).
  // 1 = on. dailySummarySentOn = the org-local date it last went out, so it sends once per day.
  dailySummary: integer('daily_summary').default(1).notNull(),
  // Business days (0=Sun … 6=Sat) and hours, org-local. The morning summary skips days off and
  // "not contacted" alerts wait for opening time. Default Mon–Sat, 9 AM–8 PM.
  workDays: jsonb('work_days').$type<number[]>().default([1, 2, 3, 4, 5, 6]).notNull(),
  workStartHour: integer('work_start_hour').default(9).notNull(),
  workEndHour: integer('work_end_hour').default(20).notNull(),
  dailySummarySentOn: varchar('daily_summary_sent_on', { length: 10 }),

  // Billing (Razorpay). plan (above) is the source of truth for entitlements; these track the subscription.
  razorpayCustomerId: varchar('razorpay_customer_id', { length: 255 }),
  // GST details for tax invoices (optional). Sent to Razorpay as the customer's GSTIN so invoices carry it.
  billingName: varchar('billing_name', { length: 255 }),
  gstin: varchar('gstin', { length: 15 }),
  razorpaySubscriptionId: varchar('razorpay_subscription_id', { length: 255 }),
  planStatus: varchar('plan_status', { length: 30 }).default('active').notNull(), // active, created, halted, cancelled
  currentPeriodEnd: timestamp('current_period_end'),
  // 1 = customer cancelled; the paid plan runs until currentPeriodEnd, then the webhook drops it to free.
  cancelAtPeriodEnd: integer('cancel_at_period_end').default(0).notNull(),
  trialEndsAt: timestamp('trial_ends_at'), // auto-reverts to 'free' when expired if not paying
  // Monthly AI credit meter. aiCreditsPeriod = 'YYYY-MM' the count belongs to; a new month resets it.
  aiCreditsUsed: integer('ai_credits_used').default(0).notNull(),
  aiCreditsPeriod: varchar('ai_credits_period', { length: 7 }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Bumped on every settings write; used for optimistic concurrency so two admins saving at once
  // don't silently clobber each other (the stale save is rejected with a conflict).
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
