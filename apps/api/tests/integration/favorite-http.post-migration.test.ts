import request from 'supertest';

import { NotFoundException } from '@backend/api/exceptions/solution.exception';
import type { FunctionSignature } from '@backend/shared/types';

import { createAccessToken, createRouteIntegrationApp } from './helpers/route-integration';

const PUBLIC_PROBLEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_PROBLEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const recursiveSignature: FunctionSignature = {
  name: 'zigzagLevelOrder',
  args: [
    {
      name: 'root',
      type: {
        type: 'array',
        items: {
          type: 'nullable',
          value: { type: 'integer' },
        },
      },
    },
  ],
  returnType: {
    type: 'array',
    items: {
      type: 'array',
      items: { type: 'integer' },
    },
  },
};

describe('Favorite HTTP integration on post-migration routes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function buildFavoriteResponse(problemId: string) {
    return {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      problemId,
      createdAt: '2026-03-24T09:00:00.000Z',
      problem: {
        id: problemId,
        title: 'Binary Tree Zigzag Level Order Traversal',
        description: 'Traverse a tree',
        difficulty: 'medium',
        constraint: '',
        tags: ['tree', 'bfs'],
        lessonId: '',
        topicId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        totalPoints: 100,
        isSolved: false,
        isFavorite: true,
        functionSignature: recursiveSignature,
        starterCodeByLanguage: {
          cpp: 'std::vector<std::vector<int>> zigzagLevelOrder(...)',
          java: 'List<List<Integer>> zigzagLevelOrder(...)',
          python: 'def zigzagLevelOrder(root):',
        },
        createdAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    };
  }

  function loadFavoriteApp() {
    const service = {
      listUserFavorites: jest.fn().mockResolvedValue([buildFavoriteResponse(PUBLIC_PROBLEM_ID)]),
      addFavorite: jest.fn(async (_userId: string, problemId: string) => {
        if (problemId === PRIVATE_PROBLEM_ID) {
          throw new NotFoundException('Challenge not found');
        }
        return buildFavoriteResponse(problemId);
      }),
      removeFavorite: jest.fn(),
      toggleFavorite: jest.fn(async (_userId: string, problemId: string) => {
        if (problemId === PRIVATE_PROBLEM_ID) {
          throw new NotFoundException('Challenge not found');
        }
        return {
          isFavorite: true,
          message: 'Challenge bookmarked successfully',
          data: buildFavoriteResponse(problemId),
        };
      }),
      listUserLessonFavorites: jest.fn().mockResolvedValue([]),
      addLessonFavorite: jest.fn(),
      removeLessonFavorite: jest.fn(),
      toggleLessonFavorite: jest.fn(),
    };

    const createFavoriteService = jest.fn(() => service);
    let createFavoriteRouter!: typeof import('@backend/api/routes/favorite.routes').createFavoriteRouter;

    jest.isolateModules(() => {
      jest.doMock('@backend/api/services/favorite.service', () => ({ createFavoriteService }));
      ({ createFavoriteRouter } = require('@backend/api/routes/favorite.routes'));
    });

    return {
      app: createRouteIntegrationApp({
        mountPath: '/api/favorites',
        createRouter: createFavoriteRouter,
      }),
      service,
    };
  }

  it('requires a real access token for favorite routes', async () => {
    const { app, service } = loadFavoriteApp();

    const response = await request(app).get('/api/favorites');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: 'NO_TOKEN',
    });
    expect(service.listUserFavorites).not.toHaveBeenCalled();
  });

  it('returns the current public favorites payload with recursive signatures intact', async () => {
    const { app, service } = loadFavoriteApp();
    const token = createAccessToken({
      userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      email: 'favorites@example.com',
      role: 'student',
    });

    const response = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(service.listUserFavorites).toHaveBeenCalledWith('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    expect(response.body.data[0].problem.functionSignature).toMatchObject({
      name: 'zigzagLevelOrder',
      args: [
        {
          name: 'root',
          type: {
            type: 'array',
            items: {
              type: 'nullable',
              value: { type: 'integer' },
            },
          },
        },
      ],
    });
    expect(response.body.data[0].problem.starterCodeByLanguage).toMatchObject({
      cpp: expect.any(String),
      java: expect.any(String),
      python: expect.any(String),
    });
  });

  it('creates a favorite for a public problem', async () => {
    const { app, service } = loadFavoriteApp();
    const token = createAccessToken({
      userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      email: 'favorite-create@example.com',
      role: 'student',
    });

    const response = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: PUBLIC_PROBLEM_ID });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.message).toBe('Challenge bookmarked successfully');
    expect(service.addFavorite).toHaveBeenCalledWith(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      PUBLIC_PROBLEM_ID,
    );
  });

  it('returns 404 when bookmarking a private or quarantined problem', async () => {
    const { app, service } = loadFavoriteApp();
    const token = createAccessToken({
      userId: '10101010-1010-4010-8010-101010101010',
      email: 'favorite-private@example.com',
      role: 'student',
    });

    const response = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ problemId: PRIVATE_PROBLEM_ID });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Challenge not found',
      },
    });
    expect(service.addFavorite).toHaveBeenCalledWith(
      '10101010-1010-4010-8010-101010101010',
      PRIVATE_PROBLEM_ID,
    );
  });

  it('returns 404 when toggling a private or quarantined problem', async () => {
    const { app, service } = loadFavoriteApp();
    const token = createAccessToken({
      userId: '12121212-1212-4212-8212-121212121212',
      email: 'favorite-toggle@example.com',
      role: 'student',
    });

    const response = await request(app)
      .put(`/api/favorites/${PRIVATE_PROBLEM_ID}/toggle`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(service.toggleFavorite).toHaveBeenCalledWith(
      '12121212-1212-4212-8212-121212121212',
      PRIVATE_PROBLEM_ID,
    );
  });
});
