import request from 'supertest';

import { createAccessToken, createRouteIntegrationApp } from './helpers/route-integration';

describe('Admin Roadmap routes integration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function loadAdminRoadmapApp() {
    const service = {
      listRoadmaps: jest.fn().mockResolvedValue({
        roadmaps: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }),
      getRoadmapDetail: jest.fn().mockResolvedValue({
        roadmap: { id: 'r1' },
        items: [],
      }),
      updateVisibility: jest.fn().mockResolvedValue({ id: 'r1', visibility: 'public' }),
      deleteRoadmap: jest.fn().mockResolvedValue({ deleted: true }),
      getAvailableItems: jest.fn().mockResolvedValue({ lessons: [], problems: [] }),
      addItemToRoadmap: jest.fn().mockResolvedValue({ id: 'item-1' }),
      removeItemFromRoadmap: jest.fn().mockResolvedValue({ removed: true }),
      createRoadmap: jest.fn().mockResolvedValue({ id: 'r2', title: 'New' }),
    };

    const createAdminRoadmapService = jest.fn(() => service);
    let createAdminRoadmapRouter!: typeof import('@backend/api/routes/admin/adminRoadmap.routes').createAdminRoadmapRouter;

    jest.isolateModules(() => {
      jest.doMock('@backend/api/services/admin/adminRoadmap.service', () => ({ createAdminRoadmapService }));
      ({ createAdminRoadmapRouter } = require('@backend/api/routes/admin/adminRoadmap.routes'));
    });

    return {
      app: createRouteIntegrationApp({
        mountPath: '/api/admin/roadmaps',
        createRouter: createAdminRoadmapRouter,
      }),
      service,
    };
  }

  function ownerToken() {
    return createAccessToken({
      userId: '22222222-2222-4222-8222-222222222222',
      email: 'owner@example.com',
      role: 'owner',
    });
  }

  // ── GET / ──────────────────────────────────────────────────────────────────

  it('GET / – requires auth token (401)', async () => {
    const { app, service } = loadAdminRoadmapApp();
    const response = await request(app).get('/api/admin/roadmaps');
    expect(response.status).toBe(401);
    expect(service.listRoadmaps).not.toHaveBeenCalled();
  });

  it('GET / – forbids student role (403)', async () => {
    const { app, service } = loadAdminRoadmapApp();
    const token = createAccessToken({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'student@example.com',
      role: 'student',
    });

    const response = await request(app)
      .get('/api/admin/roadmaps')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(service.listRoadmaps).not.toHaveBeenCalled();
  });

  it.each(['teacher', 'owner'] as const)('GET / – allows %s role (200)', async role => {
    const { app, service } = loadAdminRoadmapApp();
    const token = createAccessToken({
      userId: '22222222-2222-4222-8222-222222222222',
      email: `${role}@example.com`,
      role,
    });

    const response = await request(app)
      .get('/api/admin/roadmaps')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(service.listRoadmaps).toHaveBeenCalled();
  });

  // ── GET /available-items/list ──────────────────────────────────────────────

  it('GET /available-items/list – requires auth (401 when unauthenticated)', async () => {
    const { app, service } = loadAdminRoadmapApp();
    const response = await request(app).get('/api/admin/roadmaps/available-items/list');
    expect(response.status).toBe(401);
    expect(service.getAvailableItems).not.toHaveBeenCalled();
  });

  it('GET /available-items/list – forbids student role (403)', async () => {
    const { app, service } = loadAdminRoadmapApp();
    const token = createAccessToken({
      userId: '33333333-3333-4333-8333-333333333333',
      email: 'student2@example.com',
      role: 'student',
    });

    const response = await request(app)
      .get('/api/admin/roadmaps/available-items/list')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(service.getAvailableItems).not.toHaveBeenCalled();
  });

  it('GET /available-items/list – allows owner role (200)', async () => {
    const { app, service } = loadAdminRoadmapApp();

    const response = await request(app)
      .get('/api/admin/roadmaps/available-items/list')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(service.getAvailableItems).toHaveBeenCalled();
  });

  // ── PATCH /:id/visibility ──────────────────────────────────────────────────

  it('PATCH /:id/visibility – returns 400 for invalid visibility value', async () => {
    const { app } = loadAdminRoadmapApp();

    const response = await request(app)
      .patch('/api/admin/roadmaps/22222222-2222-4222-8222-222222222222/visibility')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ visibility: 'invalid-value' });

    expect(response.status).toBe(400);
  });

  it('PATCH /:id/visibility – returns 200 on valid update', async () => {
    const { app, service } = loadAdminRoadmapApp();

    const response = await request(app)
      .patch('/api/admin/roadmaps/22222222-2222-4222-8222-222222222222/visibility')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ visibility: 'private' });

    expect(response.status).toBe(200);
    expect(service.updateVisibility).toHaveBeenCalled();
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────────

  it('DELETE /:id – returns 200 on success', async () => {
    const { app, service } = loadAdminRoadmapApp();

    const response = await request(app)
      .delete('/api/admin/roadmaps/22222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(response.status).toBe(200);
    expect(service.deleteRoadmap).toHaveBeenCalled();
  });
});
