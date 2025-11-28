import { pgTable, uuid, timestamp, boolean } from 'drizzle-orm/pg-core';
import { exam } from './exam';
import { users } from './user';

export const examParticipations = pgTable('exam_participations', {
  id: uuid('id').defaultRandom().primaryKey(),
  examId: uuid('exam_id')
    .references(() => exam.id)
    .notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  startTime: timestamp('started_at').defaultNow().notNull(),
  endTime: timestamp('ended_at'),
  isCompleted: boolean('is_completed').default(false).notNull(),
});

export type ExamParticipationEntity = typeof examParticipations.$inferSelect;
export type ExamParticipationInsert = typeof examParticipations.$inferInsert;
