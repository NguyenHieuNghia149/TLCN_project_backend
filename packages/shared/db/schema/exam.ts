import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user';

export const exam = pgTable(
  'exam',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    registrationPassword: text('registration_password'),
    duration: integer('duration').notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    isVisible: boolean('is_visible').default(false).notNull(),
    maxAttempts: integer('max_attempts').default(1).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    status: varchar('status', { length: 30 }).default('draft').notNull(),
    accessMode: varchar('access_mode', { length: 30 }).default('open_registration').notNull(),
    selfRegistrationApprovalMode: varchar('self_registration_approval_mode', {
      length: 20,
    }),
    selfRegistrationPasswordRequired: boolean('self_registration_password_required')
      .default(false)
      .notNull(),
    allowExternalCandidates: boolean('allow_external_candidates').default(false).notNull(),
    registrationOpenAt: timestamp('registration_open_at'),
    registrationCloseAt: timestamp('registration_close_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('uq_exam_slug').on(table.slug),
    index('idx_exam_visible_created_at').on(table.isVisible, table.createdAt),
    index('idx_exam_status_start_date').on(table.status, table.startDate),
    index('idx_exam_access_mode_status').on(table.accessMode, table.status),
  ],
);

export type ExamEntity = typeof exam.$inferSelect;
export type ExamInsert = typeof exam.$inferInsert;
