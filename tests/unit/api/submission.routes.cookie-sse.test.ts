import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';

import { JWTUtils } from '@backend/shared/utils';

describe('submission routes cookie-auth SSE', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('streams submission status via cookie auth without requiring bearer headers or query tokens', async () => {
    const latestEvent = {
      submissionId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'ACCEPTED',
      overall_status: 'ACCEPTED',
    };

    const createSubmissionService = jest.fn(() => ({}));
    const getSseService = jest.fn(() => ({
      on: jest.fn(),
      removeListener: jest.fn(),
      getLatestEvent: jest.fn(() => latestEvent),
    }));

    jest.doMock('@backend/api/services/submission.service', () => ({
      createSubmissionService,
    }));
    jest.doMock('@backend/api/services/sse.service', () => ({
      getSseService,
    }));

    let createSubmissionRouter!: typeof import('@backend/api/routes/submission.routes').createSubmissionRouter;
    jest.isolateModules(() => {
      ({ createSubmissionRouter } = require('@backend/api/routes/submission.routes'));
    });

    const app = express();
    app.use(cookieParser());
    app.use('/api/submissions', createSubmissionRouter());

    const accessToken = JWTUtils.generateAccessToken(
      'cookie-user',
      'cookie-user@example.com',
      'user',
    );

    const response = await request(app)
      .get('/api/submissions/stream/123e4567-e89b-12d3-a456-426614174000')
      .set('Accept', 'text/event-stream')
      .set('Cookie', [`accessToken=${accessToken}`]);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('"status":"ACCEPTED"');
    expect(getSseService).toHaveBeenCalledTimes(1);
    expect(createSubmissionService).toHaveBeenCalledTimes(1);
  });
});
