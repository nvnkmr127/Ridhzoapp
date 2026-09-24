import { pgTable, uuid, varchar, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { leads } from "./leads";

// A reusable multi-step follow-up sequence (drip). Steps fire relative to enrolment day.
export const sequences = pgTable("sequences", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequenceId: uuid("sequence_id").references(() => sequences.id, { onDelete: "cascade" }).notNull(),
  stepIndex: integer("step_index").notNull(),
  dayOffset: integer("day_offset").default(0).notNull(),
  channel: varchar("channel", { length: 10 }).default("whatsapp").notNull(), // whatsapp | email
  body: text("body").notNull(),
  attachmentUrl: varchar("attachment_url", { length: 2048 }), // optional file/brochure link
  attachmentName: varchar("attachment_name", { length: 255 }),
}, (t) => ({
  seqIdx: index("sequence_steps_seq_idx").on(t.sequenceId, t.stepIndex),
}));

// One lead's run through one sequence. The scan worker advances active rows whose nextRunAt is due.
export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequenceId: uuid("sequence_id").references(() => sequences.id, { onDelete: "cascade" }).notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  currentStep: integer("current_step").default(0).notNull(),
  status: varchar("status", { length: 10 }).default("active").notNull(), // active | paused | completed | stopped
  retryCount: integer("retry_count").default(0).notNull(), // transient send retries for the current step
  nextRunAt: timestamp("next_run_at"),
  // Set while a rep has paused this lead's sequence; on resume the schedule shifts by the pause length.
  pausedAt: timestamp("paused_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  dueIdx: index("sequence_enrollments_due_idx").on(t.status, t.nextRunAt),
  leadIdx: index("sequence_enrollments_lead_idx").on(t.leadId),
}));
