import { Router } from 'express';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { RoadmapController } from '@backend/api/controllers/roadmap.controller';
import { createRoadmapService } from '@backend/api/services/roadmap.service';

export function createRoadmapRouter(): Router {
  const router = Router();
  const roadmapController = new RoadmapController(createRoadmapService());
  const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 1000 });


  router.get('/roadmaps', generalLimit, roadmapController.listRoadmaps);
  router.get('/roadmaps/:id', generalLimit, roadmapController.getRoadmapById);


  router.get(
    '/roadmaps/:id/progress',
    authenticationToken,
    generalLimit,
    roadmapController.getUserProgress
  );

  router.get('/user/roadmaps', authenticationToken, generalLimit, roadmapController.listUserRoadmaps);

  return router;
}
