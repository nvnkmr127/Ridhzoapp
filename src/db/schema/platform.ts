import { pgTable, uuid, varchar, text, timestamp, jsonb, numeric, index, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Small global key→JSON settings (maintenance mode, broadcast, coupons, …) read via PlatformConfigService.
export const platformConfigs = pgTable('platform_configs', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });

// GST tax invoices + credit notes. Legal records: no FK to organizations on purpose — they must
// outlive a hard-deleted tenant (org name/GSTIN are snapshotted at issue time).
// Ids stay text ("inv_…", "cn_…") because they're already in emailed /invoice/<id> links.
export const taxInvoices = pgTable('tax_invoices', {
  id: varchar('id', { length: 64 }).primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 32 }).notNull().unique(), // INV/2026-27/0001, CN/…
  orgId: uuid('org_id').notNull(),
  orgName: varchar('org_name', { length: 255 }).notNull(),
  buyerName: varchar('buyer_name', { length: 255 }),
  plan: varchar('plan', { length: 50 }).notNull(),
  amount: money('amount').notNull(),
  taxRate: money('tax_rate').notNull(),
  taxAmount: money('tax_amount').notNull(),
  cgst: money('cgst'),
  sgst: money('sgst'),
  igst: money('igst'),
  placeOfSupply: varchar('place_of_supply', { length: 2 }),
  totalAmount: money('total_amount').notNull(),
  sacCode: varchar('sac_code', { length: 10 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),
  status: varchar('status', { length: 16 }).notNull(), // paid | issued | void | refunded
  type: varchar('type', { length: 16 }).notNull().default('invoice'), // invoice | credit_note
  originalInvoiceId: varchar('original_invoice_id', { length: 64 }),
  paymentId: varchar('payment_id', { length: 64 }).unique(), // Razorpay id — webhook retries are no-ops
  issuedAt: timestamp('issued_at').notNull(),
  paidAt: timestamp('paid_at'),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
}, (t) => ({
  orgIdx: index('tax_invoices_org_idx').on(t.orgId, t.issuedAt),
  issuedIdx: index('tax_invoices_issued_idx').on(t.issuedAt),
}));

export type TicketMessage = { id: string; sender: 'tenant' | 'superadmin'; senderName: string; body: string; createdAt: string };
export type InternalNote = { id: string; authorName: string; body: string; createdAt: string };

// Tenant → platform support desk. Thread + internal notes are small per-ticket arrays, kept as JSON.
export const supportTickets = pgTable('support_tickets', {
  id: varchar('id', { length: 64 }).primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  orgName: varchar('org_name', { length: 255 }).notNull(),
  userId: uuid('user_id').notNull(), // snapshot like userEmail; no FK so deleting the user keeps the ticket
  userEmail: varchar('user_email', { length: 255 }).notNull(),
  subject: text('subject').notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  priority: varchar('priority', { length: 10 }).notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  assignedTo: varchar('assigned_to', { length: 255 }),
  slaDeadline: timestamp('sla_deadline').notNull(),
  messages: jsonb('messages').$type<TicketMessage[]>().notNull().default([]),
  internalNotes: jsonb('internal_notes').$type<InternalNote[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('support_tickets_org_idx').on(t.orgId),
  statusIdx: index('support_tickets_status_idx').on(t.status, t.createdAt),
}));

export type DailySummaryCounts = {
  overdueFollowUps: number; meetingsNeedOutcome: number; uncontactedLeads: number;
  unassignedLeads: number; meetingsToday: number; newLeads: number;
};

// The dashboard "Today" numbers, latest reading per org-local day, so the card can show "vs yesterday"
// (overdue/unassigned counts can't be rebuilt for a past day from the live tables). Pruned after 35 days.
export const dailySummarySnapshots = pgTable('daily_summary_snapshots', {
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  day: varchar('day', { length: 10 }).notNull(), // YYYY-MM-DD in the org's timezone
  counts: jsonb('counts').$type<DailySummaryCounts>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.organizationId, t.day] }),
}));
