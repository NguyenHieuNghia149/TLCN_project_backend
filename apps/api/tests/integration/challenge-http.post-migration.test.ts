import request from 'supertest';

import { NotFoundException } from '@backend/api/exceptions/solution.exception';

import { createAccessToken, createRouteIntegrationApp } from './helpers/route-integration';

const PUBLIC_CHALLENGE_ID = '11111111-1111-4111-8111-111111111111';
const PRIVATE_CHALLENGE_ID = '22222222-2222-4222-8222-222222222222';
const TOPIC_ID = '33333333-3333-4333-8333-333333333333';

describe('Challenge HTTP integration on post-migration routes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function loadChallengeApp() {
    const challengeDetail = jest.fn(async (challengeId: string, userId?: string, options?: { showAllTestcases?: boolean }) => {
      if (challengeId === PRIVATE_CHALLENGE_ID) {
        if (options?.showAllTestcases) {
          return {
            id: PRIVATE_CHALLENGE_ID,
            title: 'Private challenge',
            visibility: 'private',
            requestedBy: userId ?? null,
            showAll: true,
          };
        }

        throw new NotFoundException('Challenge not found');
      }

      return {
        id: PUBLIC_CHALLENGE_ID,
        title: 'Public challenge',
        visibility: 'public',
        requestedBy: userId ?? null,
        showAll: false,
      };
    });

    const service = {
      getChallengeById: challengeDetail,
      listProblemsByTopicInfinite: jest.fn().mockResolvedValue({
        items: [{ id: PUBLIC_CHALLENGE_ID, title: 'Public challenge' }],
        nextCursor: null,
        hasMore: false,
      }),
      getAllTags: jest.fn().mockResolvedValue(['array', 'tree']),
      getTopicTags: jest.fn().mockResolvedValue(['array']),
      listProblemsByTopicAndTags: jest.fn().mockResolvedValue({
        items: [{ id: PUBLIC_CHALLENGE_ID, title: 'Filtered challenge' }],
        nextCursor: null,
        hasMore: false,
      }),
      createChallenge: jest.fn(),
      getAllChallenges: jest.fn(),
      updateChallenge: jest.fn(),
      deleteChallenge: jest.fn(),
      updateSolutionVisibility: jest.fn(),
    };

    const createChallengeService = jest.fn(() => service);
    let createChallengeRouter!: typeof import('@backend/api/routes/challenge.routes').createChallengeRouter;

    jest.isolateModules(() => {
      jest.doMock('@backend/api/services/challenge.service', () => ({ createChallengeService }));
      ({ createChallengeRouter } = require('@backend/api/routes/challenge.routes'));
    });

    return {
      app: createRouteIntegrationApp({
        mountPath: '/api/challenges',
        createRouter: createChallengeRouter,
      }),
      service,
    };
  }

  it('returns public challenge detail on the normal path', async () => {
    const { app, service } = loadChallengeApp();

    const response = await request(app).get(`/api/challenges/${PUBLIC_CHALLENGE_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: PUBLIC_CHALLENGE_ID,
      title: 'Public challenge',
      showAll: false,
    });
    expect(service.getChallengeById).toHaveBeenCalledWith(PUBLIC_CHALLENGE_ID, undefined, {
      showAllTestcases: false,
    });
  });

  it('returns 404 for private challenge detail on the normal path', async () => {
    const { app, service } = loadChallengeApp();

    const response = await request(app).get(`/api/challenges/${PRIVATE_CHALLENGE_ID}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Challenge not found',
      },
    });
    expect(service.getChallengeById).toHaveBeenCalledWith(PRIVATE_CHALLENGE_ID, undefined, {
      showAllTestcases: false,
    });
  });

  it('does not let anonymous requests bypass private challenge visibility with showAll=true', async () => {
    const { app, service } = loadChallengeApp();

    const response = await request(app).get(`/api/challenges/${PRIVATE_CHALLENGE_ID}?showAll=true`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(service.getChallengeById).toHaveBeenCalledWith(PRIVATE_CHALLENGE_ID, undefined, {
      showAllTestcases: false,
    });
  });

  it('does not let student requests bypass private challenge visibility with showAll=true', async () => {
    const { app, service } = loadChallengeApp();
    const token = createAccessToken({
      userId: '44444444-4444-4444-8444-444444444444',
      email: 'student@example.com',
      role: 'student',
    });

    const response = await request(app)
      .get(`/api/challenges/${PRIVATE_CHALLENGE_ID}?showAll=true`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(service.getChallengeById).toHaveBeenCalledWith(
      PRIVATE_CHALLENGE_ID,
      '44444444-4444-4444-8444-444444444444',
      {
        showAllTestcases: false,
      },
    );
  });

  it.each([
    ['teacher', '55555555-5555-4555-8555-555555555555'],
    ['owner', '66666666-6666-4666-8666-666666666666'],
  ] as const)('allows %s requests to load private challenge detail with showAll=true', async (role, userId) => {
    const { app, service } = loadChallengeApp();
    const token = createAccessToken({
      userId,
      email: `${role}@example.com`,
      role,
    });

    const response = await request(app)
      .get(`/api/challenges/${PRIVATE_CHALLENGE_ID}?showAll=true`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: PRIVATE_CHALLENGE_ID,
      showAll: true,
      requestedBy: userId,
    });
    expect(service.getChallengeById).toHaveBeenCalledWith(PRIVATE_CHALLENGE_ID, userId, {
      showAllTestcases: true,
    });
  });

  it('passes optional-auth user context into topic listing requests', async () => {
    const { app, service } = loadChallengeApp();
    const token = createAccessToken({
      userId: '77777777-7777-4777-8777-777777777777',
      email: 'reader@example.com',
      role: 'student',
    });

    const response = await request(app)
      .get(`/api/challenges/problems/topic/${TOPIC_ID}?limit=5`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(service.listProblemsByTopicInfinite).toHaveBeenCalledWith({
      topicId: TOPIC_ID,
      limit: 5,
      cursor: null,
      userId: '77777777-7777-4777-8777-777777777777',
    });
  });

  it('keeps tag and filtered-topic routes publicly reachable', async () => {
    const { app, service } = loadChallengeApp();

    const [tagsResponse, topicTagsResponse, filteredResponse] = await Promise.all([
      request(app).get('/api/challenges/tags'),
      request(app).get(`/api/challenges/topics/${TOPIC_ID}/tags`),
      request(app).get(`/api/challenges/topics/${TOPIC_ID}/problems?tags=array,tree`),
    ]);

    expect(tagsResponse.status).toBe(200);
    expect(topicTagsResponse.status).toBe(200);
    expect(filteredResponse.status).toBe(200);
    expect(service.getAllTags).toHaveBeenCalledTimes(1);
    expect(service.getTopicTags).toHaveBeenCalledWith(TOPIC_ID);
    expect(service.listProblemsByTopicAndTags).toHaveBeenCalledWith({
      topicId: TOPIC_ID,
      tags: ['array', 'tree'],
      limit: 10,
      cursor: null,
      userId: undefined,
    });
  });
});
