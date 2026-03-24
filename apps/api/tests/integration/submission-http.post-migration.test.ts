import { EventEmitter } from 'node:events';
import request from 'supertest';

import { createAccessToken, createRouteIntegrationApp } from './helpers/route-integration';

const PROBLEM_ID = '99999999-9999-4999-8999-999999999999';
const SUBMISSION_ID = '88888888-8888-4888-8888-888888888888';

describe('Submission HTTP integration on post-migration routes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function loadSubmissionApp(options?: { emitTerminalStreamEvent?: boolean }) {
    const submissionEventStream = new EventEmitter();
    const service = {
      getQueueStatus: jest.fn().mockResolvedValue({ queueLength: 3, isHealthy: true }),
      submitCode: jest.fn().mockResolvedValue({
        submissionId: SUBMISSION_ID,
        status: 'PENDING',
        queuePosition: 1,
        estimatedWaitTime: 30,
      }),
      runCode: jest.fn().mockResolvedValue({
        submissionId: SUBMISSION_ID,
        status: 'PENDING',
        message: 'Queued for execution',
      }),
      getSubmissionStatus: jest.fn(),
      listUserSubmissions: jest.fn(),
      listProblemSubmissions: jest.fn(),
      listUserProblemSubmissions: jest.fn(),
    };

    const createSubmissionService = jest.fn(() => service);
    const getSseService = jest.fn(() => {
      if (options?.emitTerminalStreamEvent) {
        setImmediate(() => {
          submissionEventStream.emit(`submission_${SUBMISSION_ID}`, {
            status: 'ACCEPTED',
            message: 'done',
          });
        });
      }

      return submissionEventStream as any;
    });
    let createSubmissionRouter!: typeof import('@backend/api/routes/submission.routes').createSubmissionRouter;

    jest.isolateModules(() => {
      jest.doMock('@backend/api/services/submission.service', () => ({ createSubmissionService }));
      jest.doMock('@backend/api/services/sse.service', () => ({ getSseService }));
      ({ createSubmissionRouter } = require('@backend/api/routes/submission.routes'));
    });

    return {
      app: createRouteIntegrationApp({
        mountPath: '/api/submissions',
        createRouter: createSubmissionRouter,
      }),
      service,
      getSseService,
    };
  }

  it('keeps queue status publicly reachable', async () => {
    const { app, service } = loadSubmissionApp();

    const response = await request(app).get('/api/submissions/queue/status');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ queueLength: 3, isHealthy: true });
    expect(service.getQueueStatus).toHaveBeenCalledTimes(1);
  });

  it('requires auth for submission creation', async () => {
    const { app, service } = loadSubmissionApp();

    const response = await request(app).post('/api/submissions').send({
      sourceCode: 'print(1)',
      language: 'python',
      problemId: PROBLEM_ID,
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: 'NO_TOKEN',
    });
    expect(service.submitCode).not.toHaveBeenCalled();
  });

  it('creates a submission with the authenticated user from the JWT', async () => {
    const { app, service } = loadSubmissionApp();
    const token = createAccessToken({
      userId: '13131313-1313-4313-8313-131313131313',
      email: 'submission@example.com',
      role: 'student',
    });

    const response = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceCode: 'print(1)',
        language: 'python',
        problemId: PROBLEM_ID,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      message: 'Submission created successfully',
      submissionId: SUBMISSION_ID,
      status: 'PENDING',
    });
    expect(service.submitCode).toHaveBeenCalledWith({
      sourceCode: 'print(1)',
      language: 'python',
      problemId: PROBLEM_ID,
      userId: '13131313-1313-4313-8313-131313131313',
    });
  });

  it('keeps run-code auth and forwards the bearer header to the service', async () => {
    const { app, service } = loadSubmissionApp();
    const token = createAccessToken({
      userId: '14141414-1414-4414-8414-141414141414',
      email: 'run@example.com',
      role: 'student',
    });

    const response = await request(app)
      .post('/api/submissions/run')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceCode: 'print(1)',
        language: 'python',
        problemId: PROBLEM_ID,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(service.runCode).toHaveBeenCalledWith(
      {
        sourceCode: 'print(1)',
        language: 'python',
        problemId: PROBLEM_ID,
        userId: '14141414-1414-4414-8414-141414141414',
      },
      {
        authHeader: `Bearer ${token}`,
      },
    );
  });

  it('accepts JWTs from the query string for submission SSE streams', async () => {
    const { app, getSseService } = loadSubmissionApp({ emitTerminalStreamEvent: true });
    const token = createAccessToken({
      userId: '15151515-1515-4515-8515-151515151515',
      email: 'stream@example.com',
      role: 'student',
    });

    const response = await request(app).get(
      `/api/submissions/stream/${SUBMISSION_ID}?token=${encodeURIComponent(token)}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('data:');
    expect(response.text).toContain('ACCEPTED');
    expect(getSseService).toHaveBeenCalledTimes(1);
  });

  it('rejects SSE stream access without an auth token', async () => {
    const { app, getSseService } = loadSubmissionApp();

    const response = await request(app).get(`/api/submissions/stream/${SUBMISSION_ID}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: 'NO_TOKEN',
    });
    expect(getSseService).not.toHaveBeenCalled();
  });
});
