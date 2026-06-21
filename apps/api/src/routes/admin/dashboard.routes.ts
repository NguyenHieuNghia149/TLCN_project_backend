import { Router } from 'express';
import { DashboardController } from '@backend/api/controllers/admin/dashboard.controller';
import { createDashboardService } from '@backend/api/services/admin/dashboard.service';

/** Creates the admin dashboard router without constructing controllers at import time. */
export function createDashboardRouter(): Router {
  const router = Router();
  const dashboardService = createDashboardService();
  const controller = new DashboardController(dashboardService);

  router.get('/stats', controller.getStats);

  return router;
}
