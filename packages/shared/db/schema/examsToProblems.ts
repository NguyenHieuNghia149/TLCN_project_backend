import { pgTable, uuid, integer, primaryKey } from 'drizzle-orm/pg-core';
import { problems } from './problem';
import { exam } from './exam';

export const examToProblems = pgTable(
  'exam_to_problems',
  {
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id),
    orderIndex: integer('order_index').notNull(),
  },
  t => ({
    pk: primaryKey({ columns: [t.examId, t.problemId] }),
  })
);
export type ExamToProblemsEntity = typeof examToProblems.$inferSelect;
export type ExamToProblemsInsert = typeof examToProblems.$inferInsert;
