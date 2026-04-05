import express, { Router } from 'express';
import request from 'supertest';

import { JWTUtils } from '@backend/shared/utils';

function createPassThroughRateLimitModule() {
  return {
    rateLimitMiddleware: jest.fn(() => (req: unknown, res: unknown, next: () => void) => next()),
  };
}

function createAccessToken(userId: string, role: string = 'user') {
  return JWTUtils.generateAccessToken(userId, `${userId}@example.com`, role);
}

async function createMountedApp(options: {
  mountPath: string;
  routeModulePath: string;
  routeFactoryExport: string;
  examAccessService?: Record<string, unknown>;
  legacyExamService?: Record<string, unknown>;
}) {
  jest.resetModules();
  jest.clearAllMocks();

  const examAccessService = options.examAccessService ?? {};
  const legacyExamService = options.legacyExamService ?? {};

  jest.doMock('@backend/api/services/exam-access.service', () => ({
    createExamAccessService: jest.fn(() => examAccessService),
  }));
  jest.doMock('@backend/api/services/exam.service', () => ({
    createExamService: jest.fn(() => legacyExamService),
  }));
  jest.doMock(
    '@backend/api/middlewares/ratelimit.middleware',
    () => createPassThroughRateLimitModule(),
  );

  let routerFactory!: () => Router;
  let errorMiddleware!: typeof import('@backend/api/middlewares/error.middleware').errorMiddleware;
  jest.isolateModules(() => {
    ({ [options.routeFactoryExport]: routerFactory } = require(options.routeModulePath));
    ({ errorMiddleware } = require('@backend/api/middlewares/error.middleware'));
  });

  const app = express();
  app.use(express.json());
  app.use(options.mountPath, routerFactory());
  app.use(errorMiddleware);

  return { app, examAccessService, legacyExamService };
}

describe('Exam access HTTP routes', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns 201 Created for a fresh self-registration result', async () => {
    const registerForExam = jest.fn().mockResolvedValue({
      created: true,
      participantId: 'participant-1',
      approvalStatus: 'approved',
      accessStatus: 'eligible',
    });
    const { app } = await createMountedApp({
      mountPath: '/api/public/exams',
      routeModulePath: '@backend/api/routes/publicExam.routes',
      routeFactoryExport: 'createPublicExamRouter',
      examAccessService: {
        getPublicExamBySlug: jest.fn(),
        registerForExam,
        resolveInvite: jest.fn(),
        sendOtp: jest.fn(),
        verifyOtp: jest.fn(),
      },
    });

    const response = await request(app).post('/api/public/exams/spring/register').send({
      email: 'student@example.com',
      fullName: 'Exam Student',
    });

    expect(response.status).toBe(201);
    expect(registerForExam).toHaveBeenCalledWith('spring', {
      email: 'student@example.com',
      fullName: 'Exam Student',
      userId: undefined,
    });
    expect(response.body).toMatchObject({
      participantId: 'participant-1',
      approvalStatus: 'approved',
      accessStatus: 'eligible',
    });
  });

  it('returns the public landing payload from GET /public/exams/:slug', async () => {
    const getPublicExamBySlug = jest.fn().mockResolvedValue({
      id: 'exam-1',
      slug: 'spring',
      title: 'Spring Midterm',
      accessMode: 'open_registration',
    });
    const { app } = await createMountedApp({
      mountPath: '/api/public/exams',
      routeModulePath: '@backend/api/routes/publicExam.routes',
      routeFactoryExport: 'createPublicExamRouter',
      examAccessService: {
        getPublicExamBySlug,
        registerForExam: jest.fn(),
        resolveInvite: jest.fn(),
        sendOtp: jest.fn(),
        verifyOtp: jest.fn(),
      },
    });

    const response = await request(app).get('/api/public/exams/spring');

    expect(response.status).toBe(200);
    expect(getPublicExamBySlug).toHaveBeenCalledWith('spring');
    expect(response.body).toMatchObject({
      id: 'exam-1',
      slug: 'spring',
    });
  });

  it('forwards optional-auth userId when resolving an invite anonymously vs authenticated', async () => {
    const resolveInvite = jest.fn().mockResolvedValue({
      participantId: 'participant-1',
      entrySessionId: 'entry-session-1',
      requiresLogin: false,
      requiresOtp: true,
    });
    const { app } = await createMountedApp({
      mountPath: '/api/public/exams',
      routeModulePath: '@backend/api/routes/publicExam.routes',
      routeFactoryExport: 'createPublicExamRouter',
      examAccessService: {
        getPublicExamBySlug: jest.fn(),
        registerForExam: jest.fn(),
        resolveInvite,
        sendOtp: jest.fn(),
        verifyOtp: jest.fn(),
      },
    });

    const unauthenticatedResponse = await request(app)
      .post('/api/public/exams/spring/invites/resolve')
      .send({ inviteToken: 'invite-token' });

    const authenticatedResponse = await request(app)
      .post('/api/public/exams/spring/invites/resolve')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`)
      .send({ inviteToken: 'invite-token' });

    expect(unauthenticatedResponse.status).toBe(200);
    expect(authenticatedResponse.status).toBe(200);
    expect(resolveInvite).toHaveBeenNthCalledWith(1, 'spring', {
      inviteToken: 'invite-token',
      userId: null,
    });
    expect(resolveInvite).toHaveBeenNthCalledWith(2, 'spring', {
      inviteToken: 'invite-token',
      userId: 'user-1',
    });
  });

  it('sets the refresh-token cookie and strips it from the verify-otp JSON body', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({
      participantId: 'participant-1',
      entrySessionId: 'entry-session-1',
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const { app } = await createMountedApp({
      mountPath: '/api/public/exams',
      routeModulePath: '@backend/api/routes/publicExam.routes',
      routeFactoryExport: 'createPublicExamRouter',
      examAccessService: {
        getPublicExamBySlug: jest.fn(),
        registerForExam: jest.fn(),
        resolveInvite: jest.fn(),
        sendOtp: jest.fn(),
        verifyOtp,
      },
    });

    const response = await request(app).post('/api/public/exams/spring/otp/verify').send({
      email: 'student@example.com',
      otp: '123456',
    });

    expect(response.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith('spring', {
      email: 'student@example.com',
      otp: '123456',
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('refreshToken=refresh-token')]),
    );
    expect(response.body.tokens).toEqual({
      accessToken: 'access-token',
    });
  });

  it('returns an empty access-state for unauthenticated users', async () => {
    const getAccessState = jest.fn().mockResolvedValue({
      examId: 'exam-1',
      participantId: null,
      canStart: false,
    });
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState,
        startEntrySession: jest.fn(),
        syncParticipation: jest.fn(),
        submitActiveParticipation: jest.fn(),
      },
      legacyExamService: {
        syncSession: jest.fn(),
        submitExam: jest.fn(),
      },
    });

    const response = await request(app).get('/api/exams/spring/me/access-state');

    expect(response.status).toBe(200);
    expect(getAccessState).toHaveBeenCalledWith('spring', null);
    expect(response.body).toMatchObject({
      examId: 'exam-1',
      participantId: null,
      canStart: false,
    });
  });

  it('requires authentication before starting an entry session', async () => {
    const startEntrySession = jest.fn();
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession,
        syncParticipation: jest.fn(),
        submitActiveParticipation: jest.fn(),
      },
      legacyExamService: {
        syncSession: jest.fn(),
        submitExam: jest.fn(),
      },
    });

    const response = await request(app).post(
      '/api/exams/entry-sessions/11111111-1111-4111-8111-111111111111/start',
    );

    expect(response.status).toBe(401);
    expect(startEntrySession).not.toHaveBeenCalled();
  });

  it('starts an entry session for an authenticated user', async () => {
    const startEntrySession = jest.fn().mockResolvedValue({
      participationId: 'participation-1',
      expiresAt: '2026-04-03T09:00:00.000Z',
      firstChallengeId: 'challenge-1',
    });
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession,
        syncParticipation: jest.fn(),
        submitActiveParticipation: jest.fn(),
      },
      legacyExamService: {
        syncSession: jest.fn(),
        submitExam: jest.fn(),
      },
    });

    const response = await request(app)
      .post('/api/exams/entry-sessions/11111111-1111-4111-8111-111111111111/start')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`);

    expect(response.status).toBe(200);
    expect(startEntrySession).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'user-1',
    );
    expect(response.body).toMatchObject({
      participationId: 'participation-1',
      firstChallengeId: 'challenge-1',
    });
  });

  it('rejects malformed sync payloads before they hit the service', async () => {
    const syncParticipation = jest.fn();
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession: jest.fn(),
        syncParticipation,
        submitActiveParticipation: jest.fn(),
      },
      legacyExamService: {
        syncSession: jest.fn(),
        submitExam: jest.fn(),
      },
    });

    const response = await request(app)
      .put('/api/exams/session/sync')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`)
      .send({
        answers: {
          challengeA: { code: 'print(1)' },
        },
      });

    expect(response.status).toBe(400);
    expect(syncParticipation).not.toHaveBeenCalled();
  });

  it('routes canonical sync requests to ExamAccessService.syncParticipation', async () => {
    const syncParticipation = jest.fn().mockResolvedValue({
      synced: true,
      lastSyncedAt: '2026-04-03T08:00:00.000Z',
      participationExpiresAt: '2026-04-03T09:00:00.000Z',
      status: 'active',
    });
    const legacyExamService = {
      syncSession: jest.fn(),
      submitExam: jest.fn(),
    };
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession: jest.fn(),
        syncParticipation,
        submitActiveParticipation: jest.fn(),
      },
      legacyExamService,
    });

    const response = await request(app)
      .put('/api/exams/session/sync')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`)
      .send({
        participationId: '11111111-1111-4111-8111-111111111111',
        answers: {
          challengeA: { code: 'print(1)' },
        },
      });

    expect(response.status).toBe(200);
    expect(syncParticipation).toHaveBeenCalledWith('user-1', {
      participationId: '11111111-1111-4111-8111-111111111111',
      answers: {
        challengeA: { code: 'print(1)' },
      },
    });
    expect(legacyExamService.syncSession).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      synced: true,
      status: 'active',
    });
  });

  it('routes legacy sync payloads with sessionId to the legacy exam service', async () => {
    const syncParticipation = jest.fn();
    const syncSession = jest.fn().mockResolvedValue(true);
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession: jest.fn(),
        syncParticipation,
        submitActiveParticipation: jest.fn(),
      },
      legacyExamService: {
        syncSession,
        submitExam: jest.fn(),
      },
    });

    const response = await request(app)
      .put('/api/exams/session/sync')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`)
      .send({
        sessionId: 'legacy-session-1',
        answers: {
          challengeA: { code: 'print(1)' },
        },
        clientTimestamp: '2000-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(200);
    expect(syncSession).toHaveBeenCalledWith(
      'legacy-session-1',
      {
        challengeA: { code: 'print(1)' },
      },
      '2000-01-01T00:00:00.000Z',
    );
    expect(syncParticipation).not.toHaveBeenCalled();
    expect(response.body).toEqual({ success: true });
  });

  it('submits the active participation through the new service when no legacy participationId is provided', async () => {
    const submitActiveParticipation = jest.fn().mockResolvedValue({
      participationId: 'participation-1',
      submittedAt: '2026-04-03T08:00:00.000Z',
      scoreStatus: 'pending',
    });
    const submitExam = jest.fn();
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession: jest.fn(),
        syncParticipation: jest.fn(),
        submitActiveParticipation,
      },
      legacyExamService: {
        syncSession: jest.fn(),
        submitExam,
      },
    });

    const response = await request(app)
      .post('/api/exams/spring-midterm/submit')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`)
      .send({});

    expect(response.status).toBe(200);
    expect(submitActiveParticipation).toHaveBeenCalledWith('spring-midterm', 'user-1');
    expect(submitExam).not.toHaveBeenCalled();
  });

  it('routes legacy submit payloads with participationId to the legacy exam service', async () => {
    const submitExam = jest.fn().mockResolvedValue({
      participationId: 'participation-legacy-1',
      submittedAt: '2026-04-03T08:00:00.000Z',
    });
    const submitActiveParticipation = jest.fn();
    const { app } = await createMountedApp({
      mountPath: '/api/exams',
      routeModulePath: '@backend/api/routes/examAccess.routes',
      routeFactoryExport: 'createExamAccessRouter',
      examAccessService: {
        getAccessState: jest.fn(),
        startEntrySession: jest.fn(),
        syncParticipation: jest.fn(),
        submitActiveParticipation,
      },
      legacyExamService: {
        syncSession: jest.fn(),
        submitExam,
      },
    });

    const response = await request(app)
      .post('/api/exams/spring-midterm/submit')
      .set('Authorization', `Bearer ${createAccessToken('user-1')}`)
      .send({ participationId: 'participation-legacy-1' });

    expect(response.status).toBe(200);
    expect(submitExam).toHaveBeenCalledWith('participation-legacy-1', 'user-1');
    expect(submitActiveParticipation).not.toHaveBeenCalled();
  });
});
