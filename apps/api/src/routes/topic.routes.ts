import { Router } from 'express';
import { TopicController } from '@backend/api/controllers/topic.controller';
import { TopicService } from '@backend/api/services/topic.service';
import { authenticationToken, requireTeacher } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { CreateTopicSchema, UpdateTopicSchema } from '@backend/shared/validations/topic.validation';

/** Creates the topic router without instantiating services at import time. */
export function createTopicRouter(): Router {
  const router = Router();
  const topicService = new TopicService();
  const topicController = new TopicController(topicService);

  const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 1000 });
  const mutateLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 200 });

  router.get('/', generalLimit, topicController.list.bind(topicController));
  router.get('/:topicId', generalLimit, topicController.getById.bind(topicController));
  router.post(
    '/',
    authenticationToken,
    requireTeacher,
    mutateLimit,
    validate(CreateTopicSchema),
    topicController.create.bind(topicController)
  );
  router.put(
    '/:topicId',
    authenticationToken,
    requireTeacher,
    mutateLimit,
    validate(UpdateTopicSchema),
    topicController.update.bind(topicController)
  );
  router.delete(
    '/:topicId',
    authenticationToken,
    requireTeacher,
    mutateLimit,
    topicController.delete.bind(topicController)
  );

  return router;
}
