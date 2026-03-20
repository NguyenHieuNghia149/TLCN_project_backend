import { Router } from 'express';
import { DashboardController } from '@backend/api/controllers/admin/dashboard.controller';

/** Creates the admin dashboard router without constructing controllers at import time. */
export function createDashboardRouter(): Router {
  const router = Router();
  const controller = new DashboardController();

  router.get('/stats', controller.getStats);

  return router;
}
