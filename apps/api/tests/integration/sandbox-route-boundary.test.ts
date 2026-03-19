import express from 'express';
import request from 'supertest';

const createRouterModule = () => {
  const router = express.Router();
  return { __esModule: true, default: router };
};

jest.mock('@backend/api/routes/auth.routes', () => createRouterModule());
jest.mock('@backend/api/routes/challenge.routes', () => createRouterModule());
jest.mock('@backend/api/routes/topic.routes', () => createRouterModule());
jest.mock('@backend/api/routes/submission.routes', () => createRouterModule());
jest.mock('@backend/api/routes/security.routes', () => createRouterModule());
jest.mock('@backend/api/routes/lesson.routes', () => createRouterModule());
jest.mock('@backend/api/routes/lessonDetail.routes', () => createRouterModule());
jest.mock('@backend/api/routes/admin/adminUser.routes', () => createRouterModule());
jest.mock('@backend/api/routes/admin/adminTeacher.routes', () => createRouterModule());
jest.mock('@backend/api/routes/admin/adminLesson.routes', () => createRouterModule());
jest.mock('@backend/api/routes/admin/adminTopic.routes', () => createRouterModule());
jest.mock('@backend/api/routes/admin/dashboard.routes', () => createRouterModule());
jest.mock('@backend/api/routes/favorite.routes', () => createRouterModule());
jest.mock('@backend/api/routes/comment.routes', () => createRouterModule());
jest.mock('@backend/api/routes/learningprocess.routes', () => createRouterModule());
jest.mock('@backend/api/routes/learned-lesson.routes', () => createRouterModule());
jest.mock('@backend/api/routes/leaderboard.routes', () => createRouterModule());
jest.mock('@backend/api/routes/exam.routes', () => createRouterModule());
jest.mock('@backend/api/routes/notification.routes', () => createRouterModule());
jest.mock('@backend/shared/db/utils', () => ({
  DatabaseUtils: {
    getHealthInfo: jest.fn().mockResolvedValue({ connected: true }),
    getPoolStatus: jest.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  },
}));

import route from '@backend/api/routes';

describe('API sandbox route boundary', () => {
  it('returns 404 for /api/sandbox/* because the API app no longer mounts sandbox routes', async () => {
    const app = express();

    route(app);

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