import { index, integer, json, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { exam } from './exam';
import { users } from './user';
import { examParticipants } from './examParticipants';

export const examParticipations = pgTable(
  'exam_participations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .references(() => exam.id)
      .notNull(),
    participantId: uuid('participant_id').references(() => examParticipants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    attemptNumber: integer('attempt_number'),
    startTime: timestamp('started_at').defaultNow().notNull(),
    endTime: timestamp('ended_at'),
    submittedAt: timestamp('submitted_at'),
    expiresAt: timestamp('expires_at'),
    currentAnswers: json('current_answers').$type<Record<string, any> | null>(),
    submittedAnswersSnapshot: json('submitted_answers_snapshot').$type<Record<string, any> | null>(),
    answersLockedAt: timestamp('answers_locked_at'),
    lastSyncedAt: timestamp('last_synced_at'),
    status: varchar('status', { length: 20 }).default('IN_PROGRESS').notNull(),
    score: integer('score'),
    scoreStatus: varchar('score_status', { length: 20 }).default('pending').notNull(),
  },
  table => [
    index('idx_exam_participations_exam_user').on(table.examId, table.userId),
    index('idx_exam_participations_participant').on(table.participantId),
  ],
);

export type ExamParticipationEntity = typeof examParticipations.$inferSelect;
export type ExamParticipationInsert = typeof examParticipations.$inferInsert;
