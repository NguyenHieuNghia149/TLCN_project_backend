import { pgTable, uuid, varchar, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const exam = pgTable('exam', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  duration: integer('duration').notNull(), // in minutes
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  isVisible: boolean('is_visible').default(false).notNull(),
  maxAttempts: integer('max_attempts').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ExamEntity = typeof exam.$inferSelect;
export type ExamInsert = typeof exam.$inferInsert;
