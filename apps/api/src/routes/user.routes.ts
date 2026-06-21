import { Router } from 'express';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import UserRoadmapSelectionController from '@backend/api/controllers/user/userRoadmapSelection.controller';

export function createUserRouter(): Router {
  const router = Router();
  const controller = new UserRoadmapSelectionController();

  router.get('/roadmap-selection', authenticationToken, controller.getUserSelection.bind(controller));
  router.post('/roadmap-selection', authenticationToken, controller.selectRoadmap.bind(controller));

  return router;
}

