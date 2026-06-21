import request from 'supertest';

import { createAccessToken, createRouteIntegrationApp } from './helpers/route-integration';

describe('Language HTTP integration on post-migration routes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function loadLanguageApp() {
    const service = {
      listActiveExecutableLanguages: jest.fn().mockResolvedValue([
        { id: 'lang-cpp', key: 'cpp', displayName: 'C++', sortOrder: 0, isActive: true },
        { id: 'lang-java', key: 'java', displayName: 'Java', sortOrder: 1, isActive: true },
        { id: 'lang-python', key: 'python', displayName: 'Python', sortOrder: 2, isActive: true },
      ]),
      listAllLanguages: jest.fn().mockResolvedValue([
        { id: 'lang-cpp', key: 'cpp', displayName: 'C++', sortOrder: 0, isActive: true },
        { id: 'lang-java', key: 'java', displayName: 'Java', sortOrder: 1, isActive: true },
        { id: 'lang-python', key: 'python', displayName: 'Python', sortOrder: 2, isActive: false },
      ]),
      updateLanguage: jest.fn().mockResolvedValue({
        id: 'lang-python',
        key: 'python',
        displayName: 'Python',
        sortOrder: 2,
        isActive: false,
      }),
    };

    const createSupportedLanguageService = jest.fn(() => service);
    let createSupportedLanguageRouter!: typeof import('@backend/api/routes/supportedLanguage.routes').createSupportedLanguageRouter;

    jest.isolateModules(() => {
      jest.doMock('@backend/api/services/supportedLanguage.service', () => ({
        createSupportedLanguageService,
      }));
      ({ createSupportedLanguageRouter } = require('@backend/api/routes/supportedLanguage.routes'));
    });

    return {
      app: createRouteIntegrationApp({
        mountPath: '/api',
        createRouter: createSupportedLanguageRouter,
      }),
      service,
    };
  }

  it('returns only active executable languages from GET /languages', async () => {
    const { app, service } = loadLanguageApp();

    const response = await request(app).get('/api/languages');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items.map((item: any) => item.key)).toEqual(['cpp', 'java', 'python']);
    expect(service.listActiveExecutableLanguages).toHaveBeenCalledTimes(1);
  });

  it('requires elevated auth for GET /admin/languages', async () => {
    const { app } = loadLanguageApp();

    const response = await request(app).get('/api/admin/languages');

    expect(response.status).toBe(401);
  });

  it('returns the full catalog from GET /admin/languages for teacher users', async () => {
    const { app, service } = loadLanguageApp();
    const token = createAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'teacher@example.com',
      role: 'teacher',
    });

    const response = await request(app)
      .get('/api/admin/languages')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(3);
    expect(service.listAllLanguages).toHaveBeenCalledTimes(1);
  });

  it('updates a catalog entry through PUT /admin/languages/:id', async () => {
    const { app, service } = loadLanguageApp();
    const token = createAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'teacher@example.com',
      role: 'teacher',
    });

    const response = await request(app)
      .put('/api/admin/languages/lang-python')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Python', sortOrder: 2, isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: 'lang-python',
      key: 'python',
      isActive: false,
    });
    expect(service.updateLanguage).toHaveBeenCalledWith('lang-python', {
      displayName: 'Python',
      sortOrder: 2,
      isActive: false,
    });
  });
});
