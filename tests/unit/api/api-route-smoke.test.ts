import type { Router } from 'express';

describe('API route factory smoke tests', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('creates the submission router without touching the lazy SSE service', () => {
    const getSseService = jest.fn();

    jest.doMock('@backend/api/services/sse.service', () => ({ getSseService }));

    let createSubmissionRouter!: typeof import('@backend/api/routes/submission.routes').createSubmissionRouter;
    jest.isolateModules(() => {
      ({ createSubmissionRouter } = require('@backend/api/routes/submission.routes'));
    });

    const router = createSubmissionRouter();

    expect(getSseService).not.toHaveBeenCalled();
    expect(typeof (router as Router).use).toBe('function');
    expect((router as any).stack.length).toBeGreaterThan(0);
  });

  it('creates the challenge router successfully after the factory refactor', () => {
    let createChallengeRouter!: typeof import('@backend/api/routes/challenge.routes').createChallengeRouter;
    jest.isolateModules(() => {
      ({ createChallengeRouter } = require('@backend/api/routes/challenge.routes'));
    });

    const router = createChallengeRouter();

    expect(typeof (router as Router).use).toBe('function');
    expect((router as any).stack.length).toBeGreaterThan(0);
  });

  it('creates every route factory without throwing', () => {
    const getSseService = jest.fn();

    jest.doMock('nodemailer', () => ({
      __esModule: true,
      default: {
        createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
      },
    }));
    jest.doMock('@backend/api/services/sse.service', () => ({ getSseService }));
    jest.doMock('@backend/api/controllers/exam.controller', () => ({
      ExamController: class ExamController {
        constructor(...args: unknown[]) {}
        getExams = jest.fn();
        getExamById = jest.fn();
        getExamChallenge = jest.fn();
        joinExam = jest.fn();
        submitExam = jest.fn();
        getLeaderboard = jest.fn();
        getExamLeaderboard = jest.fn();
        getMyParticipation = jest.fn();
        getOrCreateSession = jest.fn();
        getParticipationSubmission = jest.fn();
        getParticipation = jest.fn();
        syncSession = jest.fn();
        createExam = jest.fn();
        updateExam = jest.fn();
        deleteExam = jest.fn();
      },
      CreateExamSchema: {},
    }));
    jest.doMock('@backend/shared/validations/exam.validation', () => ({
      JoinExamSchema: {},
      SubmitExamSchema: {},
      GetExamLeaderboardSchema: {},
      UpdateExamSchema: {},
    }));
    jest.doMock('@backend/api/controllers/examAccess.controller', () => ({
      PublicExamController: class PublicExamController {
        constructor(...args: unknown[]) {}
        getPublicExam = jest.fn();
        register = jest.fn();
        resolveInvite = jest.fn();
        sendOtp = jest.fn();
        verifyOtp = jest.fn();
      },
      ExamAccessController: class ExamAccessController {
        constructor(...args: unknown[]) {}
        getAccessState = jest.fn();
        startEntrySession = jest.fn();
        syncSession = jest.fn();
        submitExam = jest.fn();
      },
    }));
    jest.doMock('@backend/api/controllers/adminExam.controller', () => ({
      AdminExamController: class AdminExamController {
        constructor(...args: unknown[]) {}
        listExams = jest.fn();
        getExamById = jest.fn();
        createExam = jest.fn();
        updateExam = jest.fn();
        publishExam = jest.fn();
        getParticipants = jest.fn();
        addParticipants = jest.fn();
        importParticipants = jest.fn();
        approveParticipant = jest.fn();
        rejectParticipant = jest.fn();
        revokeParticipant = jest.fn();
        resendInvite = jest.fn();
        bindAccount = jest.fn();
        mergeParticipants = jest.fn();
      },
    }));
    jest.doMock('@backend/shared/validations/exam-access.validation', () => ({
      ExamSlugParamsSchema: {},
      PublicExamRegisterSchema: {},
      PublicExamInviteResolveSchema: {},
      PublicExamOtpSendSchema: {},
      PublicExamOtpVerifySchema: {},
      ExamEntrySessionStartParamsSchema: {},
      CreateAdminExamSchema: {},
      UpdateAdminExamSchema: {},
      AdminExamListQuerySchema: {},
      AdminExamAddParticipantsSchema: {},
      AdminExamBindAccountSchema: {},
      AdminExamMergeParticipantsSchema: {},
      ExamIdParamsSchema: {},
      ExamParticipantParamsSchema: {},
    }));

    jest.isolateModules(() => {
      const factories = [
        require('@backend/api/routes/auth.routes').createAuthRouter,
        require('@backend/api/routes/supportedLanguage.routes').createSupportedLanguageRouter,
        require('@backend/api/routes/challenge.routes').createChallengeRouter,
        require('@backend/api/routes/comment.routes').createCommentRouter,
        require('@backend/api/routes/publicExam.routes').createPublicExamRouter,
        require('@backend/api/routes/examAccess.routes').createExamAccessRouter,
        require('@backend/api/routes/exam.routes').createExamRouter,
        require('@backend/api/routes/favorite.routes').createFavoriteRouter,
        require('@backend/api/routes/leaderboard.routes').createLeaderboardRouter,
        require('@backend/api/routes/learned-lesson.routes').createLearnedLessonRouter,
        require('@backend/api/routes/learningprocess.routes').createLearningProcessRouter,
        require('@backend/api/routes/lesson.routes').createLessonRouter,
        require('@backend/api/routes/lessonDetail.routes').createLessonDetailRouter,
        require('@backend/api/routes/notification.routes').createNotificationRouter,
        require('@backend/api/routes/security.routes').createSecurityRouter,
        require('@backend/api/routes/submission.routes').createSubmissionRouter,
        require('@backend/api/routes/topic.routes').createTopicRouter,
        require('@backend/api/routes/user.routes').createUserRouter,
        require('@backend/api/routes/admin/adminUser.routes').createAdminUserRouter,
        require('@backend/api/routes/admin/adminTeacher.routes').createAdminTeacherRouter,
        require('@backend/api/routes/admin/adminLesson.routes').createAdminLessonRouter,
        require('@backend/api/routes/admin/adminTopic.routes').createAdminTopicRouter,
        require('@backend/api/routes/admin/adminExam.routes').createAdminExamRouter,
        require('@backend/api/routes/admin/dashboard.routes').createDashboardRouter,
      ];

      for (const factory of factories) {
        expect(() => factory()).not.toThrow();
      }
    });

    expect(getSseService).not.toHaveBeenCalled();
  });
});
