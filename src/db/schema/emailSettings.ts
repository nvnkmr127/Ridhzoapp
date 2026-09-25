import { pgTable, uuid, varchar, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// Per-tenant SMTP configuration. When enabled + complete, the org's own mail server is used to
// send lead-facing email (falling back to the shared Resend transport otherwise). The SMTP
// password is stored encrypted (see lib/crypto/secret).
export const emailSettings = pgTable('email_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull().unique(),
  fromName: varchar('from_name', { length: 255 }),
  fromEmail: varchar('from_email', { length: 255 }),
  smtpHost: varchar('smtp_host', { length: 255 }),
  smtpPort: integer('smtp_port'),
  // Legacy: TLS is now derived from the port (465 = implicit TLS, else STARTTLS). Kept in sync on write.
  smtpSecure: integer('smtp_secure').default(1).notNull(),
  smtpUser: varchar('smtp_user', { length: 255 }),
  smtpPasswordEnc: text('smtp_password_enc'), // AES-256-GCM ciphertext
  replyTo: varchar('reply_to', { length: 255 }),
  enabled: integer('enabled').default(0).notNull(),
  verifiedAt: timestamp('verified_at'), // last successful test of the CURRENT credentials; null after a change
  lastError: text('last_error'), // last failed send through this server, cleared by the next success
  lastErrorAt: timestamp('last_error_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
