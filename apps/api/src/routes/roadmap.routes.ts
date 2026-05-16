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

  /**
   * R14.5: More specific routes must come BEFORE generic :id route
   * Otherwise /roadmaps/:id matches /roadmaps/detail-with-locks treating it as ID
   */
  router.get(
    '/roadmaps/:id/detail-with-locks',
    authenticationToken,
    generalLimit,
    roadmapController.getRoadmapDetailWithLockStatus
  );

  router.get(
    '/roadmaps/:id/progress',
    authenticationToken,
    generalLimit,
    roadmapController.getUserProgress
  );

  /**
   * R14.5: Mark roadmap item as completed (sequential unlocking)
   * Validates prerequisite and returns unlocked next item
   */
  router.post(
    '/roadmaps/:id/items/:itemId/complete',
    authenticationToken,
    generalLimit,
    roadmapController.completeRoadmapItem
  );

  /**
   * Mark a lesson/problem as completed in a roadmap using its content ID.
   * Used by ProblemDetailPage after an ACCEPTED submission (and optionally by LessonDetail).
   * Body: { contentId: string, itemType: 'lesson' | 'problem' }
   */
  router.post(
    '/roadmaps/:id/complete-by-content',
    authenticationToken,
    generalLimit,
    roadmapController.completeByContent
  );

  // Generic roadmap routes come AFTER specific ones
  router.get('/roadmaps/:id', generalLimit, roadmapController.getRoadmapById);
  router.get('/user/roadmaps', authenticationToken, generalLimit, roadmapController.listUserRoadmaps);

  return router;
}
