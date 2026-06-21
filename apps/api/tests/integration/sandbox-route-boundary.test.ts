import express from 'express';
import request from 'supertest';

/** Creates a mocked route factory module that returns a fresh Express router. */
const createRouteFactoryModule = (exportName: string) => {
  const factory = jest.fn(() => express.Router());
  return { [exportName]: factory };
};

jest.mock('@backend/api/routes/auth.routes', () => createRouteFactoryModule('createAuthRouter'));
jest.mock('@backend/api/routes/challenge.routes', () =>
  createRouteFactoryModule('createChallengeRouter')
);
jest.mock('@backend/api/routes/topic.routes', () => createRouteFactoryModule('createTopicRouter'));
jest.mock('@backend/api/routes/submission.routes', () =>
  createRouteFactoryModule('createSubmissionRouter')
);
jest.mock('@backend/api/routes/security.routes', () =>
  createRouteFactoryModule('createSecurityRouter')
);
jest.mock('@backend/api/routes/lesson.routes', () => createRouteFactoryModule('createLessonRouter'));
jest.mock('@backend/api/routes/lessonDetail.routes', () =>
  createRouteFactoryModule('createLessonDetailRouter')
);
jest.mock('@backend/api/routes/admin/adminUser.routes', () =>
  createRouteFactoryModule('createAdminUserRouter')
);
jest.mock('@backend/api/routes/admin/adminTeacher.routes', () =>
  createRouteFactoryModule('createAdminTeacherRouter')
);
jest.mock('@backend/api/routes/admin/adminLesson.routes', () =>
  createRouteFactoryModule('createAdminLessonRouter')
);
jest.mock('@backend/api/routes/admin/adminTopic.routes', () =>
  createRouteFactoryModule('createAdminTopicRouter')
);
jest.mock('@backend/api/routes/admin/dashboard.routes', () =>
  createRouteFactoryModule('createDashboardRouter')
);
jest.mock('@backend/api/routes/favorite.routes', () =>
  createRouteFactoryModule('createFavoriteRouter')
);
jest.mock('@backend/api/routes/comment.routes', () => createRouteFactoryModule('createCommentRouter'));
jest.mock('@backend/api/routes/learningprocess.routes', () =>
  createRouteFactoryModule('createLearningProcessRouter')
);
jest.mock('@backend/api/routes/learned-lesson.routes', () =>
  createRouteFactoryModule('createLearnedLessonRouter')
);
jest.mock('@backend/api/routes/leaderboard.routes', () =>
  createRouteFactoryModule('createLeaderboardRouter')
);
jest.mock('@backend/api/routes/exam.routes', () => createRouteFactoryModule('createExamRouter'));
jest.mock('@backend/api/routes/notification.routes', () =>
  createRouteFactoryModule('createNotificationRouter')
);
jest.mock('@backend/shared/db/utils', () => ({
  DatabaseUtils: {
    getHealthInfo: jest.fn().mockResolvedValue({ connected: true }),
    getPoolStatus: jest.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  },
}));

import { registerRoutes } from '@backend/api/routes';

describe('API sandbox route boundary', () => {
  it('returns 404 for /api/sandbox/* because the API app no longer mounts sandbox routes', async () => {
    const app = express();

    registerRoutes(app);

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        code: 'NOT_FOUND',
      });
    });

    const response = await request(app).get('/api/sandbox/health');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
  });
});
