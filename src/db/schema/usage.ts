import { pgTable, uuid, varchar, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Monthly metered usage per workspace (see domains/billing/usageService). One row per (org, month, metric);
// the counter is bumped by a single atomic upsert that refuses to pass the plan cap, so concurrent
// requests can't overshoot it.
export const usageCounters = pgTable('usage_counters', {
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  period: varchar('period', { length: 7 }).notNull(), // 'YYYY-MM' (UTC)
  metric: varchar('metric', { length: 32 }).notNull(), // messages | emails | exports | import_rows | api_requests
  used: integer('used').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.organizationId, t.period, t.metric] }),
}));
