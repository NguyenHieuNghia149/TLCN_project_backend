import request from 'supertest';

describe('api SSE compression boundary', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('does not gzip submission event streams', async () => {
    const registerRoutes = jest.fn((app: import('express').Express) => {
      app.get('/api/submissions/stream/:submissionId', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).send(`data: ${'x'.repeat(2048)}\n\n`);
      });
    });

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('../../../apps/api/src/routes', () => ({ registerRoutes }));
    jest.doMock('../../../apps/api/src/routes/admin', () => ({ createAdminRouter: jest.fn() }));

    let createApiApp!: typeof import('../../../apps/api/src/index').createApiApp;
    jest.isolateModules(() => {
      ({ createApiApp } = require('../../../apps/api/src/index'));
    });

    const app = createApiApp();
    const response = await request(app)
      .get('/api/submissions/stream/test-submission')
      .set('Accept', 'text/event-stream')
      .set('Accept-Encoding', 'gzip');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.text).toContain('data:');
  }, 15000);
});
