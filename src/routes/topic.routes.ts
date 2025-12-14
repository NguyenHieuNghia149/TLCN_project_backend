import { Router } from 'express';
import { TopicController } from '@/controllers/topic.controller';
import { TopicService } from '@/services/topic.service';
import { authenticationToken, requireTeacher } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { CreateTopicSchema, UpdateTopicSchema } from '@/validations/topic.validation';

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

router.use(TopicController.errorHandler);

export default router;
