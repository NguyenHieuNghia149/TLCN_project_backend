// Export all schemas
export * from './user';
export * from './token';
export * from './topic';
export * from './lesson';
export * from './problem';
export * from './testcase';
export * from './solution';
export * from './submission';
export * from './resultSubmission';

// Relations
import { relations } from 'drizzle-orm';
import { users } from './user';
import { refreshTokens } from './token';
import { topic } from './topic';
import { lesson } from './lesson';
import { problem } from './problem';
import { testcase } from './testcase';
import { solution } from './solution';
import { submission } from './submission';
import { resultSubmission } from './resultSubmission';

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  submissions: many(submission),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const topicsRelations = relations(topic, ({ many }) => ({
  lessons: many(lesson),
  problems: many(problem),
}));

export const lessonsRelations = relations(lesson, ({ many, one }) => ({
  topic: one(topic, {
    fields: [lesson.topicId],
    references: [topic.id],
  }),
  problems: many(problem),
}));

export const problemsRelations = relations(problem, ({ one, many }) => ({
  lesson: one(lesson, {
    fields: [problem.lessonId],
    references: [lesson.id],
  }),
  topic: one(topic, {
    fields: [problem.topicId],
    references: [topic.id],
  }),
  testcases: many(testcase),
  solutions: many(solution),
  submissions: many(submission),
}));

export const testcasesRelations = relations(testcase, ({ one }) => ({
  problem: one(problem, {
    fields: [testcase.problemId],
    references: [problem.id],
  }),
}));

export const solutionsRelations = relations(solution, ({ one }) => ({
  problem: one(problem, {
    fields: [solution.problemId],
    references: [problem.id],
  }),
}));

export const submissionsRelations = relations(submission, ({ one, many }) => ({
  user: one(users, {
    fields: [submission.userId],
    references: [users.id],
  }),
  problem: one(problem, {
    fields: [submission.problemId],
    references: [problem.id],
  }),
  results: many(resultSubmission),
}));

export const resultSubmissionsRelations = relations(resultSubmission, ({ one }) => ({
  submission: one(submission, {
    fields: [resultSubmission.submissionId],
    references: [submission.id],
  }),
  testcase: one(testcase, {
    fields: [resultSubmission.testcaseId],
    references: [testcase.id],
  }),
}));
