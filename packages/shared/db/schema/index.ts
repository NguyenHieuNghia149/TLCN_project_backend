// Export all schemas
export * from './user';
export * from './token';
export * from './topic';
export * from './lesson';
export * from './problem';
export * from './testcase';
export * from './solution';
export * from './solutionApproaches';
export * from './solutionApproachCodeVariants';
export * from './languages';
export * from './submission';
export * from './resultSubmission';
export * from './favorite';
export * from './comment';
export * from './commentLike';
export * from './completed_lesson';
export * from './exam';
export * from './examsToProblems';
export * from './examParticipations';
export * from './examParticipants';
export * from './examInvites';
export * from './examEntrySessions';
export * from './examAuditLogs';
export * from './notification';
export * from './roadmap';
export * from './roadmapItem';
export * from './roadmapProgress';

// Relations
import { relations } from 'drizzle-orm';
import { comments } from './comment';
import { learnedLessons } from './completed_lesson';
import { exam } from './exam';
import { examAuditLogs } from './examAuditLogs';
import { examEntrySessions } from './examEntrySessions';
import { examInvites } from './examInvites';
import { examParticipants } from './examParticipants';
import { examParticipations } from './examParticipations';
import { examToProblems } from './examsToProblems';
import { favorite } from './favorite';
import { languages } from './languages';
import { lessons } from './lesson';
import { notifications } from './notification';
import { roadmaps } from './roadmap';
import { roadmapItems } from './roadmapItem';
import { roadmapProgress } from './roadmapProgress';
import { problems } from './problem';
import { resultSubmissions } from './resultSubmission';
import { solutions } from './solution';
import { solutionApproachCodeVariants } from './solutionApproachCodeVariants';
import { solutionApproaches } from './solutionApproaches';
import { submissions } from './submission';
import { testcases } from './testcase';
import { refreshTokens } from './token';
import { topics } from './topic';
import { users } from './user';

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  submissions: many(submissions),
  learnedLessons: many(learnedLessons),
  notifications: many(notifications),
  createdExams: many(exam),
  examParticipants: many(examParticipants),
  examInvites: many(examInvites),
  examAuditLogs: many(examAuditLogs),
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
  learnedBy: many(learnedLessons),
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
  examToProblems: many(examToProblems),
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

export const solutionApproachesRelations = relations(solutionApproaches, ({ one, many }) => ({
  solution: one(solutions, {
    fields: [solutionApproaches.solutionId],
    references: [solutions.id],
  }),
  codeVariantRows: many(solutionApproachCodeVariants),
}));

export const solutionApproachCodeVariantsRelations = relations(
  solutionApproachCodeVariants,
  ({ one }) => ({
    approach: one(solutionApproaches, {
      fields: [solutionApproachCodeVariants.approachId],
      references: [solutionApproaches.id],
    }),
    languageCatalogEntry: one(languages, {
      fields: [solutionApproachCodeVariants.languageId],
      references: [languages.id],
    }),
  }),
);

export const languagesRelations = relations(languages, ({ many }) => ({
  submissions: many(submissions),
  solutionApproachCodeVariants: many(solutionApproachCodeVariants),
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
  languageCatalogEntry: one(languages, {
    fields: [submissions.languageId],
    references: [languages.id],
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

export const learnedLessonsRelations = relations(learnedLessons, ({ one }) => ({
  user: one(users, {
    fields: [learnedLessons.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [learnedLessons.lessonId],
    references: [lessons.id],
  }),
}));

export const examRelations = relations(exam, ({ many, one }) => ({
  creator: one(users, {
    fields: [exam.createdBy],
    references: [users.id],
  }),
  examToProblems: many(examToProblems),
  examParticipations: many(examParticipations),
  participants: many(examParticipants),
  invites: many(examInvites),
  entrySessions: many(examEntrySessions),
  auditLogs: many(examAuditLogs),
}));

export const examParticipationsRelations = relations(examParticipations, ({ one, many }) => ({
  exam: one(exam, {
    fields: [examParticipations.examId],
    references: [exam.id],
  }),
  participant: one(examParticipants, {
    fields: [examParticipations.participantId],
    references: [examParticipants.id],
  }),
  user: one(users, {
    fields: [examParticipations.userId],
    references: [users.id],
  }),
  entrySessions: many(examEntrySessions),
}));

export const examToProblemsRelations = relations(examToProblems, ({ one }) => ({
  exam: one(exam, {
    fields: [examToProblems.examId],
    references: [exam.id],
  }),
  problem: one(problems, {
    fields: [examToProblems.problemId],
    references: [problems.id],
  }),
}));

export const examParticipantsRelations = relations(examParticipants, ({ one, many }) => ({
  exam: one(exam, {
    fields: [examParticipants.examId],
    references: [exam.id],
  }),
  user: one(users, {
    fields: [examParticipants.userId],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [examParticipants.approvedBy],
    references: [users.id],
  }),
  invites: many(examInvites),
  entrySessions: many(examEntrySessions),
  participations: many(examParticipations),
}));

export const examInvitesRelations = relations(examInvites, ({ one }) => ({
  exam: one(exam, {
    fields: [examInvites.examId],
    references: [exam.id],
  }),
  participant: one(examParticipants, {
    fields: [examInvites.participantId],
    references: [examParticipants.id],
  }),
  invitedByUser: one(users, {
    fields: [examInvites.invitedBy],
    references: [users.id],
  }),
}));

export const examEntrySessionsRelations = relations(examEntrySessions, ({ one }) => ({
  exam: one(exam, {
    fields: [examEntrySessions.examId],
    references: [exam.id],
  }),
  participant: one(examParticipants, {
    fields: [examEntrySessions.participantId],
    references: [examParticipants.id],
  }),
  invite: one(examInvites, {
    fields: [examEntrySessions.inviteId],
    references: [examInvites.id],
  }),
  participation: one(examParticipations, {
    fields: [examEntrySessions.participationId],
    references: [examParticipations.id],
  }),
}));

export const examAuditLogsRelations = relations(examAuditLogs, ({ one }) => ({
  exam: one(exam, {
    fields: [examAuditLogs.examId],
    references: [exam.id],
  }),
  actor: one(users, {
    fields: [examAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  creator: one(users, {
    fields: [roadmaps.createdBy],
    references: [users.id],
  }),
  items: many(roadmapItems),
  progress: many(roadmapProgress),
}));

export const roadmapItemsRelations = relations(roadmapItems, ({ one }) => ({
  roadmap: one(roadmaps, {
    fields: [roadmapItems.roadmapId],
    references: [roadmaps.id],
  }),
}));

export const roadmapProgressRelations = relations(roadmapProgress, ({ one }) => ({
  roadmap: one(roadmaps, {
    fields: [roadmapProgress.roadmapId],
    references: [roadmaps.id],
  }),
  user: one(users, {
    fields: [roadmapProgress.userId],
    references: [users.id],
  }),
}));
