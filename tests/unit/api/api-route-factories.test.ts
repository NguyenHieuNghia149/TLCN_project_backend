/** Creates a mocked route factory that records mount order without using real route modules. */
function createFactoryMock() {
  const handler = ((req: unknown, res: unknown, next: () => void) => next()) as any;
  return jest.fn(() => handler);
}

describe('API route registrar', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('mounts routes in the same order as the previous registrar', () => {
    const generalLimiter = jest.fn();
    const createAuthRouter = createFactoryMock();
    const createSupportedLanguageRouter = createFactoryMock();
    const createChallengeRouter = createFactoryMock();
    const createFavoriteRouter = createFactoryMock();
    const createTopicRouter = createFactoryMock();
    const createSubmissionRouter = createFactoryMock();
    const createSecurityRouter = createFactoryMock();
    const createLessonRouter = createFactoryMock();
    const createLessonDetailRouter = createFactoryMock();
    const createAdminUserRouter = createFactoryMock();
    const createAdminTeacherRouter = createFactoryMock();
    const createAdminLessonRouter = createFactoryMock();
    const createAdminTopicRouter = createFactoryMock();
    const createDashboardRouter = createFactoryMock();
    const createCommentRouter = createFactoryMock();
    const createLearningProcessRouter = createFactoryMock();
    const createLearnedLessonRouter = createFactoryMock();
    const createPublicExamRouter = createFactoryMock();
    const createAdminExamRouter = createFactoryMock();
    const createExamAccessRouter = createFactoryMock();
    const createExamRouter = createFactoryMock();
    const createLeaderboardRouter = createFactoryMock();
    const createNotificationRouter = createFactoryMock();

    jest.doMock('../../../apps/api/src/middlewares/ratelimit.middleware', () => ({
      generalLimiter,
    }));
    jest.doMock('../../../apps/api/src/routes/auth.routes', () => ({ createAuthRouter }));
    jest.doMock('../../../apps/api/src/routes/supportedLanguage.routes', () => ({
      createSupportedLanguageRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/challenge.routes', () => ({ createChallengeRouter }));
    jest.doMock('../../../apps/api/src/routes/favorite.routes', () => ({ createFavoriteRouter }));
    jest.doMock('../../../apps/api/src/routes/topic.routes', () => ({ createTopicRouter }));
    jest.doMock('../../../apps/api/src/routes/submission.routes', () => ({ createSubmissionRouter }));
    jest.doMock('../../../apps/api/src/routes/security.routes', () => ({ createSecurityRouter }));
    jest.doMock('../../../apps/api/src/routes/lesson.routes', () => ({ createLessonRouter }));
    jest.doMock('../../../apps/api/src/routes/lessonDetail.routes', () => ({
      createLessonDetailRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/admin/adminUser.routes', () => ({
      createAdminUserRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/admin/adminTeacher.routes', () => ({
      createAdminTeacherRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/admin/adminLesson.routes', () => ({
      createAdminLessonRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/admin/adminTopic.routes', () => ({
      createAdminTopicRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/admin/dashboard.routes', () => ({
      createDashboardRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/comment.routes', () => ({ createCommentRouter }));
    jest.doMock('../../../apps/api/src/routes/learningprocess.routes', () => ({
      createLearningProcessRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/learned-lesson.routes', () => ({
      createLearnedLessonRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/publicExam.routes', () => ({
      createPublicExamRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/admin/adminExam.routes', () => ({
      createAdminExamRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/examAccess.routes', () => ({
      createExamAccessRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/exam.routes', () => ({ createExamRouter }));
    jest.doMock('../../../apps/api/src/routes/leaderboard.routes', () => ({
      createLeaderboardRouter,
    }));
    jest.doMock('../../../apps/api/src/routes/notification.routes', () => ({
      createNotificationRouter,
    }));
    jest.doMock('@backend/shared/db/utils', () => ({
      DatabaseUtils: {
        getHealthInfo: jest.fn(),
        getPoolStatus: jest.fn(),
      },
    }));

    let registerRoutes!: typeof import('../../../apps/api/src/routes').registerRoutes;
    jest.isolateModules(() => {
      ({ registerRoutes } = require('../../../apps/api/src/routes'));
    });

    const app = { use: jest.fn() } as any;
    registerRoutes(app);

    expect(app.use.mock.calls.map((call: any[]) => call[0])).toEqual([
      '/api',
      '/api/auth',
      '/api',
      '/api/challenges',
      '/api/favorites',
      '/api/topics',
      '/api/submissions',
      '/api/security',
      '/api/lessons',
      '/api/lesson-details',
      '/api/admin/users',
      '/api/admin/teachers',
      '/api/admin/lessons',
      '/api/admin/topics',
      '/api/admin/dashboard',
      '/api/comments',
      '/api/learningprocess',
      '/api/learned-lessons',
      '/api/public/exams',
      '/api/admin/exams',
      '/api/exams',
      '/api/exams',
      '/api/leaderboard',
      '/api/notifications',
      '/api/health',
    ]);
  });
});
