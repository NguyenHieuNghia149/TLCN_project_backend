import { DashboardController } from '@backend/api/controllers/admin/dashboard.controller';
import { createMockResponse } from './controller-test-helpers';

describe('DashboardController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected dashboard service to load stats', async () => {
    const stats = { users: 10, lessons: 5 };
    const dashboardService = {
      getStats: jest.fn().mockResolvedValue(stats),
    } as any;
    const controller = new DashboardController(dashboardService);
    const response = createMockResponse();

    await controller.getStats({} as any, response as any);

    expect(dashboardService.getStats).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: stats });
  });
});
