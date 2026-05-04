import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from './exam';
import { examInvites } from './examInvites';
import { examParticipants } from './examParticipants';
import { examParticipations } from './examParticipations';

export const examEntrySessions = pgTable(
  'exam_entry_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .references(() => exam.id)
      .notNull(),
    participantId: uuid('participant_id')
      .references(() => examParticipants.id)
      .notNull(),
    inviteId: uuid('invite_id').references(() => examInvites.id),
    participationId: uuid('participation_id').references(() => examParticipations.id),
    verificationMethod: varchar('verification_method', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).default('opened').notNull(),
    verifiedAt: timestamp('verified_at'),
    expiresAt: timestamp('expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_entry_sessions_exam_participant').on(table.examId, table.participantId),
    index('idx_exam_entry_sessions_participation').on(table.participationId),
  ],
);

export type ExamEntrySessionEntity = typeof examEntrySessions.$inferSelect;
export type ExamEntrySessionInsert = typeof examEntrySessions.$inferInsert;
