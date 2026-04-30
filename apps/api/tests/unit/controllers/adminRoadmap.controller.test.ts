import { AdminRoadmapController } from '@backend/api/controllers/admin/adminRoadmap.controller';
import type { AdminRoadmapService } from '@backend/api/services/admin/adminRoadmap.service';

function createRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function createService(overrides: Partial<AdminRoadmapService> = {}): AdminRoadmapService {
  return {
    listRoadmaps: jest.fn().mockResolvedValue({ roadmaps: [], pagination: { limit: 20, offset: 0, total: 0 } }),
    getRoadmapDetail: jest.fn().mockResolvedValue({ roadmap: { id: 'r1' }, items: [] }),
    updateVisibility: jest.fn().mockResolvedValue({ id: 'r1', visibility: 'public' }),
    deleteRoadmap: jest.fn().mockResolvedValue({ deleted: true }),
    addItemToRoadmap: jest.fn().mockResolvedValue({ id: 'item-1' }),
    removeItemFromRoadmap: jest.fn().mockResolvedValue({ removed: true }),
    getAvailableItems: jest.fn().mockResolvedValue({ lessons: [], problems: [] }),
    createRoadmap: jest.fn().mockResolvedValue({ id: 'r2', title: 'New' }),
    ...overrides,
  } as unknown as AdminRoadmapService;
}

describe('AdminRoadmapController', () => {
  describe('list', () => {
    it('returns 200 with list payload using standard API contract', async () => {
      const service = createService();
      const controller = new AdminRoadmapController(service);
      const req: any = { query: { limit: '20', offset: '0' } };
      const res = createRes();

      await controller.list(req, res);

      expect(service.listRoadmaps).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Object),
        error: null,
      });
    });
  });

  describe('create', () => {
    it('returns 401 when userId is missing from token', async () => {
      const service = createService();
      const controller = new AdminRoadmapController(service);
      const req: any = { user: undefined, body: { title: 'Test' } };
      const res = createRes();

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(service.createRoadmap).not.toHaveBeenCalled();
    });

    it('returns 201 with roadmap on success', async () => {
      const fakeRoadmap = { id: 'r1', title: 'Test' };
      const service = createService({ createRoadmap: jest.fn().mockResolvedValue(fakeRoadmap) } as any);
      const controller = new AdminRoadmapController(service);
      const req: any = {
        user: { userId: 'admin-1' },
        body: { title: 'Test', visibility: 'public' },
      };
      const res = createRes();

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeRoadmap, error: null });
    });
  });

  describe('updateVisibility', () => {
    it('returns 401 when adminId is missing', async () => {
      const service = createService();
      const controller = new AdminRoadmapController(service);
      const req: any = { user: undefined, params: { id: 'r1' }, body: { visibility: 'private' } };
      const res = createRes();

      await controller.updateVisibility(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(service.updateVisibility).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('returns 401 when adminId is missing', async () => {
      const service = createService();
      const controller = new AdminRoadmapController(service);
      const req: any = { user: undefined, params: { id: 'r1' } };
      const res = createRes();

      await controller.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(service.deleteRoadmap).not.toHaveBeenCalled();
    });

    it('returns 200 with deleted flag on success', async () => {
      const service = createService();
      const controller = new AdminRoadmapController(service);
      const req: any = { user: { userId: 'admin-1' }, params: { id: 'r1' } };
      const res = createRes();

      await controller.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { deleted: true }, error: null });
    });
  });

  describe('getAvailableItems', () => {
    it('returns 200 with lessons and problems from service', async () => {
      const fakeData = {
        lessons: [{ id: 'l1', title: 'Lesson 1', type: 'lesson' }],
        problems: [{ id: 'p1', title: 'Problem 1', type: 'problem' }],
      };
      const service = createService({ getAvailableItems: jest.fn().mockResolvedValue(fakeData) } as any);
      const controller = new AdminRoadmapController(service);
      const req: any = {};
      const res = createRes();

      await controller.getAvailableItems(req, res);

      expect(service.getAvailableItems).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData, error: null });
    });
  });
});
