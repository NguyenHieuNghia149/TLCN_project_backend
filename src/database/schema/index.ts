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
export * from './favorite';
export * from './comment';

// Relations
import { relations } from 'drizzle-orm';
import { users } from './user';
import { refreshTokens } from './token';
import { topics } from './topic';
import { lessons } from './lesson';
import { problems } from './problem';
import { testcases } from './testcase';
import { solutions } from './solution';
import { solutionApproaches } from './solutionApproaches';
import { submissions } from './submission';
import { resultSubmissions } from './resultSubmission';
import { favorite } from './favorite';
import { comments } from './comment';

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  submissions: many(submissions),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const topicsRelations = relations(topics, ({ many }) => ({
  lessons: many(lessons),
  problems: many(problems),
}));

export const lessonsRelations = relations(lessons, ({ many, one }) => ({
  topic: one(topics, {
    fields: [lessons.topicId],
    references: [topics.id],
  }),
  problems: many(problems),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  lesson: one(lessons, {
    fields: [problems.lessonId],
    references: [lessons.id],
  }),
  topic: one(topics, {
    fields: [problems.topicId],
    references: [topics.id],
  }),
  testcases: many(testcases),
  solutions: one(solutions),
  submissions: many(submissions),
}));

export const testcasesRelations = relations(testcases, ({ one }) => ({
  problem: one(problems, {
    fields: [testcases.problemId],
    references: [problems.id],
  }),
}));

export const solutionsRelations = relations(solutions, ({ one, many }) => ({
  problem: one(problems, {
    fields: [solutions.problemId],
    references: [problems.id],
  }),
  approaches: many(solutionApproaches),
}));

export const solutionApproachesRelations = relations(solutionApproaches, ({ one }) => ({
  solution: one(solutions, {
    fields: [solutionApproaches.solutionId],
    references: [solutions.id],
  }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  user: one(users, {
    fields: [submissions.userId],
    references: [users.id],
  }),
  problem: one(problems, {
    fields: [submissions.problemId],
    references: [problems.id],
  }),
  results: many(resultSubmissions),
}));

export const resultSubmissionsRelations = relations(resultSubmissions, ({ one }) => ({
  submission: one(submissions, {
    fields: [resultSubmissions.submissionId],
    references: [submissions.id],
  }),
  testcase: one(testcases, {
    fields: [resultSubmissions.testcaseId],
    references: [testcases.id],
  }),
}));

export const favoriteRelations = relations(favorite, ({ one }) => ({
  user: one(users, {
    fields: [favorite.userId],
    references: [users.id],
  }),
  problem: one(problems, {
    fields: [favorite.problemId],
    references: [problems.id],
  }),
  lesson: one(lessons, {
    fields: [favorite.lessonId],
    references: [lessons.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [comments.lessonId],
    references: [lessons.id],
  }),
  problem: one(problems, {
    fields: [comments.problemId],
    references: [problems.id],
  }),
}));
