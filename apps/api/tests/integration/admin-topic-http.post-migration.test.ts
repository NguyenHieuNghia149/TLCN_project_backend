import request from 'supertest';

import {
  createAccessToken,
  createAccessTokenCookieHeader,
  createRouteIntegrationApp,
} from './helpers/route-integration';

describe('Admin Topic HTTP integration on post-migration routes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function loadAdminTopicApp() {
    const service = {
      listTopics: jest.fn().mockResolvedValue({
        items: [{ id: '11111111-1111-4111-8111-111111111111', topicName: 'Arrays' }],
        pagination: {
          page: 2,
          limit: 20,
          total: 21,
          totalPages: 2,
        },
      }),
      getTopicById: jest.fn(),
      createTopic: jest.fn().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        topicName: 'Graphs',
      }),
      updateTopic: jest.fn(),
      deleteTopic: jest.fn(),
      getTopicStats: jest.fn(),
    };

    const createAdminTopicService = jest.fn(() => service);
    let createAdminTopicRouter!: typeof import('@backend/api/routes/admin/adminTopic.routes').createAdminTopicRouter;

    jest.isolateModules(() => {
      jest.doMock('@backend/api/services/admin/adminTopic.service', () => ({
        createAdminTopicService,
      }));
      ({ createAdminTopicRouter } = require('@backend/api/routes/admin/adminTopic.routes'));
    });

    return {
      app: createRouteIntegrationApp({
        mountPath: '/api/admin/topics',
        createRouter: createAdminTopicRouter,
      }),
      service,
    };
  }

  it('requires elevated auth for GET /admin/topics', async () => {
    const { app, service } = loadAdminTopicApp();

    const response = await request(app).get('/api/admin/topics');

    expect(response.status).toBe(401);
    expect(service.listTopics).not.toHaveBeenCalled();
  });

  it.each(['teacher', 'admin', 'instructor'] as const)(
    'returns the topic directory from GET /admin/topics for %s users',
    async (role) => {
      const { app, service } = loadAdminTopicApp();
      const token = createAccessToken({
        userId: '11111111-1111-4111-8111-111111111111',
        email: `${role}@example.com`,
        role,
      });

      const response = await request(app)
        .get('/api/admin/topics')
        .query({ page: 2, limit: 20, search: 'arr', sortBy: 'topicName', sortOrder: 'asc' })
        .set('Cookie', createAccessTokenCookieHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      expect(service.listTopics).toHaveBeenCalledWith(
        {
          search: 'arr',
          topicName: undefined,
        },
        {
          page: 2,
          limit: 20,
          sortBy: 'topicName',
          sortOrder: 'asc',
        },
      );
    },
  );

  it.each(['teacher', 'admin', 'instructor'] as const)(
    'creates a topic through POST /admin/topics for %s users',
    async (role) => {
      const { app, service } = loadAdminTopicApp();
      const token = createAccessToken({
        userId: '11111111-1111-4111-8111-111111111111',
        email: `${role}@example.com`,
        role,
      });

      const response = await request(app)
        .post('/api/admin/topics')
        .set('Cookie', createAccessTokenCookieHeader(token))
        .send({ topicName: 'Graphs' });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        id: '22222222-2222-4222-8222-222222222222',
        topicName: 'Graphs',
      });
      expect(service.createTopic).toHaveBeenCalledWith({ topicName: 'Graphs' });
    },
  );
});
