import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import request from 'supertest';

import { JWTUtils } from '@backend/shared/utils/jwt';

function passThrough() {
  return (req: unknown, res: unknown, next: () => void) => next();
}

function createAccessToken(userId: string, role: 'user' | 'teacher' | 'owner' | 'admin') {
  return JWTUtils.generateAccessToken(userId, `${userId}@example.com`, role);
}

function createAccessTokenCookieHeader(
  userId: string,
  role: 'user' | 'teacher' | 'owner' | 'admin',
) {
  return [`accessToken=${createAccessToken(userId, role)}`];
}

const examId = '11111111-1111-4111-8111-111111111111';
const participationId = '22222222-2222-4222-8222-222222222222';

function mockSharedUtils() {
  jest.doMock('@backend/shared/utils', () => ({
    JWTUtils: require('@backend/shared/utils/jwt').JWTUtils,
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  }));
}

describe('admin proctoring review routes', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('wires review summary, recompute, and review decision endpoints', async () => {
    const middleware = passThrough();
    jest.doMock('@backend/api/middlewares/validate.middleware', () => ({
      validate: jest.fn(() => middleware),
    }));
    jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
      rateLimitMiddleware: jest.fn(() => middleware),
    }));
    mockSharedUtils();

    const settingsService = { updateSettings: jest.fn() };
    const bypassService = { issueBypassCode: jest.fn() };
    const reviewService = {
      getReview: jest.fn().mockResolvedValue({ summary: { riskLevel: 'low' } }),
      recompute: jest.fn().mockResolvedValue({ id: 'summary-1' }),
      recordReviewDecision: jest.fn().mockResolvedValue({ reviewerDecision: 'no_action' }),
      recordReviewLabel: jest.fn().mockResolvedValue({ id: 'label-1' }),
      translateLlmSummary: jest
        .fn()
        .mockResolvedValue({ translatedText: 'Ban dich tieng Viet.', targetLanguage: 'vi' }),
    };

    jest.doMock('@backend/api/services/proctoring/proctoring-settings.service', () => ({
      createProctoringSettingsService: jest.fn(() => settingsService),
    }));
    jest.doMock('@backend/api/services/proctoring/proctoring-bypass.service', () => ({
      createProctoringBypassService: jest.fn(() => bypassService),
    }));
    jest.doMock('@backend/api/services/proctoring/proctoring-admin-review.service', () => ({
      createProctoringAdminReviewService: jest.fn(() => reviewService),
    }));

    let createAdminProctoringRouter!: () => Router;
    jest.isolateModules(() => {
      ({ createAdminProctoringRouter } = require('@backend/api/routes/admin/adminProctoring.routes'));
    });

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/exams', createAdminProctoringRouter());

    expect(
      await request(app).get(
        `/api/admin/exams/${examId}/participations/${participationId}/proctoring?eventName=clipboard_event&limit=25&offset=5`,
      )
        .set('Cookie', createAccessTokenCookieHeader('teacher-1', 'teacher'))
    ).toMatchObject({ status: 200 });
    expect(reviewService.getReview).toHaveBeenCalledWith(
      examId,
      participationId,
      { userId: 'teacher-1', role: 'teacher' },
      expect.objectContaining({ eventName: 'clipboard_event', limit: 25, offset: 5 })
    );

    expect(
      await request(app)
        .post(`/api/admin/exams/${examId}/participations/${participationId}/proctoring/recompute`)
        .set('Cookie', createAccessTokenCookieHeader('teacher-1', 'teacher'))
        .send({ needsReReview: true })
    ).toMatchObject({ status: 200 });
    expect(reviewService.recompute).toHaveBeenCalledWith(
      examId,
      participationId,
      { userId: 'teacher-1', role: 'teacher' },
      expect.objectContaining({ needsReReview: true })
    );

    expect(
      await request(app)
        .post(`/api/admin/exams/${examId}/participations/${participationId}/proctoring/review`)
        .set('Cookie', createAccessTokenCookieHeader('teacher-1', 'teacher'))
        .send({ decision: 'no_action', notes: 'Reviewed.' })
    ).toMatchObject({ status: 200 });
    expect(reviewService.recordReviewDecision).toHaveBeenCalledWith(
      examId,
      participationId,
      { userId: 'teacher-1', role: 'teacher' },
      expect.objectContaining({ decision: 'no_action' })
    );

    expect(
      await request(app)
        .post(`/api/admin/exams/${examId}/participations/${participationId}/proctoring/labels`)
        .set('Cookie', createAccessTokenCookieHeader('teacher-1', 'teacher'))
        .send({ reviewOutcome: 'policy_review_required', evidenceConfidence: 'high' })
    ).toMatchObject({ status: 200 });
    expect(reviewService.recordReviewLabel).toHaveBeenCalledWith(
      examId,
      participationId,
      { userId: 'teacher-1', role: 'teacher' },
      expect.objectContaining({ reviewOutcome: 'policy_review_required' })
    );

    expect(
      await request(app)
        .post(`/api/admin/exams/${examId}/participations/${participationId}/proctoring/llm-summary/translate`)
        .set('Cookie', createAccessTokenCookieHeader('teacher-1', 'teacher'))
        .send({ targetLanguage: 'vi' })
    ).toMatchObject({ status: 200 });
    expect(reviewService.translateLlmSummary).toHaveBeenCalledWith(
      examId,
      participationId,
      { userId: 'teacher-1', role: 'teacher' },
      { targetLanguage: 'vi' }
    );
  });

  it('blocks non-admin roles before the review service runs', async () => {
    const middleware = passThrough();
    jest.doMock('@backend/api/middlewares/validate.middleware', () => ({
      validate: jest.fn(() => middleware),
    }));
    jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
      rateLimitMiddleware: jest.fn(() => middleware),
    }));
    mockSharedUtils();

    const reviewService = {
      getReview: jest.fn().mockResolvedValue({ summary: { riskLevel: 'low' } }),
      recompute: jest.fn(),
      recordReviewDecision: jest.fn(),
      recordReviewLabel: jest.fn(),
      translateLlmSummary: jest.fn(),
    };
    jest.doMock('@backend/api/services/proctoring/proctoring-settings.service', () => ({
      createProctoringSettingsService: jest.fn(() => ({ updateSettings: jest.fn() })),
    }));
    jest.doMock('@backend/api/services/proctoring/proctoring-bypass.service', () => ({
      createProctoringBypassService: jest.fn(() => ({ issueBypassCode: jest.fn() })),
    }));
    jest.doMock('@backend/api/services/proctoring/proctoring-admin-review.service', () => ({
      createProctoringAdminReviewService: jest.fn(() => reviewService),
    }));

    let createAdminProctoringRouter!: () => Router;
    jest.isolateModules(() => {
      ({ createAdminProctoringRouter } = require('@backend/api/routes/admin/adminProctoring.routes'));
    });

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/exams', createAdminProctoringRouter());

    const response = await request(app)
      .get(`/api/admin/exams/${examId}/participations/${participationId}/proctoring`)
      .set('Cookie', createAccessTokenCookieHeader('user-1', 'user'));

    expect(response.status).toBe(403);
    expect(reviewService.getReview).not.toHaveBeenCalled();
  });

  it('allows an admin token through to service-level exam authorization', async () => {
    const middleware = passThrough();
    jest.doMock('@backend/api/middlewares/validate.middleware', () => ({
      validate: jest.fn(() => middleware),
    }));
    jest.doMock('@backend/api/middlewares/ratelimit.middleware', () => ({
      rateLimitMiddleware: jest.fn(() => middleware),
    }));
    mockSharedUtils();

    const reviewService = {
      getReview: jest.fn().mockResolvedValue({ summary: { riskLevel: 'low' } }),
      recompute: jest.fn(),
      recordReviewDecision: jest.fn(),
      recordReviewLabel: jest.fn(),
      translateLlmSummary: jest.fn(),
    };
    jest.doMock('@backend/api/services/proctoring/proctoring-settings.service', () => ({
      createProctoringSettingsService: jest.fn(() => ({ updateSettings: jest.fn() })),
    }));
    jest.doMock('@backend/api/services/proctoring/proctoring-bypass.service', () => ({
      createProctoringBypassService: jest.fn(() => ({ issueBypassCode: jest.fn() })),
    }));
    jest.doMock('@backend/api/services/proctoring/proctoring-admin-review.service', () => ({
      createProctoringAdminReviewService: jest.fn(() => reviewService),
    }));

    let createAdminProctoringRouter!: () => Router;
    jest.isolateModules(() => {
      ({ createAdminProctoringRouter } = require('@backend/api/routes/admin/adminProctoring.routes'));
    });

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/admin/exams', createAdminProctoringRouter());

    const response = await request(app)
      .get(`/api/admin/exams/${examId}/participations/${participationId}/proctoring`)
      .set('Cookie', createAccessTokenCookieHeader('admin-1', 'admin'));

    expect(response.status).toBe(200);
    expect(reviewService.getReview).toHaveBeenCalledWith(
      examId,
      participationId,
      { userId: 'admin-1', role: 'admin' },
      expect.any(Object)
    );
  });
});
