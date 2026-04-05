import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { exam } from './exam';
import { examParticipants } from './examParticipants';
import { users } from './user';

export const examInvites = pgTable(
  'exam_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .references(() => exam.id)
      .notNull(),
    participantId: uuid('participant_id')
      .references(() => examParticipants.id)
      .notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by')
      .references(() => users.id)
      .notNull(),
    sentAt: timestamp('sent_at'),
    openedAt: timestamp('opened_at'),
    usedAt: timestamp('used_at'),
    revokedAt: timestamp('revoked_at'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_invites_exam_participant').on(table.examId, table.participantId),
    index('idx_exam_invites_token_hash').on(table.tokenHash),
  ],
);

export type ExamInviteEntity = typeof examInvites.$inferSelect;
export type ExamInviteInsert = typeof examInvites.$inferInsert;
