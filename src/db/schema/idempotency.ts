import { pgTable, uuid, varchar, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { organizations } from './organizations';

// One row per mobile request that carries an Idempotency-Key. The app queues notes / contact logs /
// replies while offline and retries them; when a request went through but its response was lost,
// the retry replays the stored response instead of logging the same thing twice.
export const apiIdempotencyKeys = pgTable('api_idempotency_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 100 }).notNull(),
  route: varchar('route', { length: 200 }).notNull(),
  status: integer('status'), // null while the first request is still running
  response: jsonb('response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgKeyUnique: uniqueIndex('api_idempotency_keys_org_key_unique').on(t.organizationId, t.key),
  createdIdx: index('api_idempotency_keys_created_idx').on(t.createdAt),
}));
